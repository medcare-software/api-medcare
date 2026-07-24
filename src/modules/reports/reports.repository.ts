import { Prisma } from '@prisma/client'
import type { MedicationStripeColor, SubscriptionStatus } from '@prisma/client'

import { db } from '../../config/database.js'

type MedicationsFilters = {
  search?: string
  stripeColor?: MedicationStripeColor
  continuousUse?: boolean
  state?: string
  city?: string
  doctorIds?: string[]
  clinicIds?: string[]
}

// Escapa curingas de LIKE/ILIKE pra busca por nome não se comportar de forma
// inesperada caso o medicamento tenha literalmente "%" ou "_" no nome.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// Fragmento WITH compartilhado por medicationsRanking/medicationsGrouped/
// countMedicationsGrouped — resolve estado/cidade "efetivos" com fallback pro
// membro admin da família (FamilyMember.userId é nulo quando o membro não tem
// login próprio, ex.: menor de idade, mas o admin da família sempre tem).
function buildFilteredMedicationsCte(filters: MedicationsFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = []

  if (filters.search) {
    conditions.push(
      Prisma.sql`m.name ILIKE ${`%${escapeLikePattern(filters.search)}%`} ESCAPE '\\'`,
    )
  }
  if (filters.stripeColor) {
    conditions.push(Prisma.sql`m."stripeColor" = ${filters.stripeColor}::"MedicationStripeColor"`)
  }
  if (filters.continuousUse !== undefined) {
    conditions.push(Prisma.sql`m."continuousUse" = ${filters.continuousUse}`)
  }
  if (filters.state) {
    conditions.push(Prisma.sql`COALESCE(u.state, u_admin.state) = ${filters.state}`)
  }
  if (filters.city) {
    conditions.push(Prisma.sql`COALESCE(u.city, u_admin.city) = ${filters.city}`)
  }
  if (filters.doctorIds && filters.doctorIds.length > 0) {
    conditions.push(Prisma.sql`m."doctorId" IN (${Prisma.join(filters.doctorIds)})`)
  }
  if (filters.clinicIds && filters.clinicIds.length > 0) {
    // EXISTS em vez de JOIN: um médico vinculado a mais de uma clínica ativa
    // faria um JOIN direto multiplicar linhas (fan-out), corrompendo os
    // agregados de medicationsGrouped mesmo sem esse filtro ativo.
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM clinic_doctor_links cdl
      WHERE cdl."doctorId" = m."doctorId" AND cdl.active = true
        AND cdl."clinicId" IN (${Prisma.join(filters.clinicIds)})
    )`)
  }

  const whereClause =
    conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

  return Prisma.sql`
    filtered AS (
      SELECT m.id, m.name, m.dosage, m."dosageUnit", m.form, m."stripeColor", m."continuousUse"
      FROM medications m
      JOIN family_members fm ON fm.id = m."memberId" AND fm."deletedAt" IS NULL
      LEFT JOIN users u ON u.id = fm."userId" AND u."deletedAt" IS NULL
      -- LATERAL + LIMIT 1 garante no máximo 1 linha por medicamento mesmo se
      -- uma família tiver mais de um membro isAdmin=true (não há constraint
      -- de unicidade no schema pra isso) — evita fan-out igual ao caso acima.
      LEFT JOIN LATERAL (
        SELECT u2.state, u2.city
        FROM family_members fm2
        JOIN users u2 ON u2.id = fm2."userId" AND u2."deletedAt" IS NULL
        WHERE fm2."familyId" = fm."familyId" AND fm2."isAdmin" = true AND fm2."deletedAt" IS NULL
        LIMIT 1
      ) u_admin ON true
      ${whereClause}
    )
  `
}

export interface GroupedMedicationRow {
  name: string
  dosage: string
  dosageUnit: string
  form: string
  stripeColor: MedicationStripeColor
  totalCount: bigint
  continuousUsePercent: number
  taken: bigint
  takenOrLate: bigint
}

const SUBSCRIBED_STATUSES = ['ACTIVE', 'LATE'] as const

export type AtRiskFilters = {
  thresholdDate: Date
  search?: string
  status?: SubscriptionStatus
  planId?: string
}

export const reportsRepository = {
  // ── Clientes / Financeiro (assinantes clínica+médico combinados) ──────────
  findClinicsWithSubscription() {
    return db.clinic.findMany({
      where: {
        deletedAt: null,
        subscriptions: { some: { status: { in: [...SUBSCRIBED_STATUSES] } } },
      },
      include: {
        subscriptions: {
          where: { status: { in: [...SUBSCRIBED_STATUSES] } },
          include: { plan: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    })
  },

  findDoctorsWithSubscription() {
    return db.doctor.findMany({
      where: {
        deletedAt: null,
        subscriptions: { some: { status: { in: [...SUBSCRIBED_STATUSES] } } },
      },
      include: {
        user: { select: { name: true } },
        subscriptions: {
          where: { status: { in: [...SUBSCRIBED_STATUSES] } },
          include: { plan: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    })
  },

  // ── Médicos e clínicas ──────────────────────────────────────────────────
  specialtiesRanking() {
    return db.$queryRaw<{ specialty: string; count: bigint }[]>`
      SELECT unnest(specialties) AS specialty, count(*)::bigint AS count
      FROM doctors
      WHERE "deletedAt" IS NULL AND status = 'ACTIVE'
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `
  },

  clinicsCountByState() {
    return db.$queryRaw<{ state: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(address->>'state', ''), 'N/D') AS state, count(*)::bigint AS count
      FROM clinics
      WHERE "deletedAt" IS NULL
      GROUP BY 1
      ORDER BY count DESC
    `
  },

  doctorsCountByState() {
    return db.$queryRaw<{ state: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(c.address->>'state', ''), 'N/D') AS state, count(DISTINCT cdl."doctorId")::bigint AS count
      FROM clinic_doctor_links cdl
      JOIN clinics c ON c.id = cdl."clinicId"
      WHERE cdl.active = true AND c."deletedAt" IS NULL
      GROUP BY 1
      ORDER BY count DESC
    `
  },

  // Pacientes distintos que já liberaram acesso ao prontuário para um médico
  // (status ACTIVE) — mede a ação do paciente de "liberar acesso", não se o
  // médico chegou a abrir o prontuário (isso é countAccessGrantsAccessedByDoctor).
  async countDistinctPatientsWithDoctorAccess() {
    const rows = await db.medicalAccessGrant.findMany({
      where: { doctorId: { not: null }, status: 'ACTIVE' },
      distinct: ['memberId'],
      select: { memberId: true },
    })
    return rows.length
  },

  countExamsBySource(source: 'DOCTOR' | 'CLINIC' | 'MANUAL' | 'GMAIL') {
    return db.exam.count({ where: { source } })
  },

  countActiveDoctors() {
    return db.doctor.count({ where: { deletedAt: null, status: 'ACTIVE' } })
  },

  // Total de médicos ativos, e quantos deles estão vinculados a alguma
  // clínica (ClinicDoctorLink ativo) — solo = total - linked.
  async countActiveDoctorsByClinicLinkage() {
    const [total, linked] = await Promise.all([
      db.doctor.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      db.doctor.count({
        where: { deletedAt: null, status: 'ACTIVE', clinics: { some: { active: true } } },
      }),
    ])
    return { total, linked, solo: total - linked }
  },

  findActiveDoctors(pagination: { skip: number; take: number }) {
    return db.doctor.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countAccessGrantsAccessedByDoctor(doctorId: string) {
    return db.medicalAccessGrant.count({ where: { doctorId, lastAccessedAt: { not: null } } })
  },

  countExamsSentByDoctor(doctorId: string) {
    return db.exam.count({ where: { doctorId, source: 'DOCTOR' } })
  },

  countExamsRegisteredByDoctor(doctorId: string) {
    return db.exam.count({ where: { doctorId } })
  },

  // ── Planos ──────────────────────────────────────────────────────────────
  countActivePlans() {
    return db.plan.count({ where: { status: 'ACTIVE' } })
  },

  countActivePlansByType() {
    return db.plan.groupBy({ by: ['type'], where: { status: 'ACTIVE' }, _count: { _all: true } })
  },

  // Total faturado (Payment.amountCents, sem filtro de status) no mês de
  // referência informado — usado pro comparativo "vs período anterior" do
  // KPI de receita, mesmo racional de invoicedCents em paymentEvolutionByMonth.
  paymentsTotalForMonth(monthStart: Date) {
    return db.payment.aggregate({
      _sum: { amountCents: true },
      where: { referenceMonth: monthStart },
    })
  },

  // ── Financeiro ──────────────────────────────────────────────────────────
  // Evolução mensal do ano calendário atual (Jan–Dez), a partir do Payment
  // (cobrança por ciclo, `referenceMonth` já é o 1º dia do mês) — meses sem
  // registro ainda entram como 0 (o gráfico sempre mostra os 12 meses).
  paymentEvolutionByMonth() {
    return db.$queryRaw<
      { month: number; invoicedCents: bigint; receivedCents: bigint; overdueCents: bigint }[]
    >`
      SELECT
        EXTRACT(MONTH FROM "referenceMonth")::int AS month,
        COALESCE(SUM("amountCents"), 0)::bigint AS "invoicedCents",
        COALESCE(SUM("amountCents") FILTER (WHERE status IN ('PAID', 'PAID_LATE')), 0)::bigint AS "receivedCents",
        COALESCE(SUM("amountCents") FILTER (WHERE status = 'OVERDUE'), 0)::bigint AS "overdueCents"
      FROM payments
      WHERE EXTRACT(YEAR FROM "referenceMonth") = EXTRACT(YEAR FROM now())
      GROUP BY 1
      ORDER BY 1
    `
  },

  // ── Crescimento do app ────────────────────────────────────────────────
  countUsersByState() {
    return db.user.groupBy({
      by: ['state'],
      where: {
        deletedAt: null,
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
      },
      _count: { _all: true },
    })
  },

  countUsersByCity(state?: string) {
    return db.user.groupBy({
      by: ['city', 'state'],
      where: {
        deletedAt: null,
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
        city: { not: null },
        ...(state && { state }),
      },
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
      take: 5,
    })
  },

  // ── Medicamentos ──────────────────────────────────────────────────────
  // Top 10 sem filtro (mesma convenção de tarjaDistribution/doseAdherenceDistribution
  // — só a tabela paginada (medicationsGrouped) respeita os filtros completos).
  // Agrupa por nome (case-insensitive) + dosagem exata, já que "dipirona" e
  // "Dipirona" na mesma mg são o mesmo medicamento, mas mg diferentes não são.
  medicationsRanking() {
    const cte = buildFilteredMedicationsCte({})
    return db.$queryRaw<{ name: string; dosage: string; dosageUnit: string; count: bigint }[]>(
      Prisma.sql`
        WITH ${cte}
        SELECT
          mode() WITHIN GROUP (ORDER BY name) AS name,
          dosage,
          "dosageUnit",
          COUNT(*)::bigint AS count
        FROM filtered
        GROUP BY LOWER(name), dosage, "dosageUnit"
        ORDER BY count DESC
        LIMIT 10
      `,
    )
  },

  tarjaDistribution() {
    return db.medication.groupBy({
      by: ['stripeColor'],
      _count: { _all: true },
    })
  },

  // Só TAKEN/LATE contam — MISSED (nunca tomado) não é "tomada no horário" nem
  // "fora do horário", fica de fora da métrica de aderência.
  doseAdherenceDistribution() {
    return db.medicationDoseRecord.groupBy({
      by: ['state'],
      where: { state: { in: ['TAKEN', 'LATE'] } },
      _count: { _all: true },
    })
  },

  countMedications() {
    return db.medication.count()
  },

  countMedicationsContinuousUse() {
    return db.medication.count({ where: { continuousUse: true } })
  },

  countMedicationsCreatedSince(since: Date) {
    return db.medication.count({ where: { createdAt: { gte: since } } })
  },

  countMedicationsCreatedInRange(start: Date, end: Date) {
    return db.medication.count({ where: { createdAt: { gte: start, lt: end } } })
  },

  countDistinctMedicationMembers() {
    return db.medication.findMany({ distinct: ['memberId'], select: { memberId: true } })
  },

  // Reaproveitado pelo relatório de crescimento (KPI "Média de remédios") além
  // do relatório de medicamentos, pra não duplicar a conta.
  async averageMedicationsPerUser() {
    const [totalMedications, distinctMembers] = await Promise.all([
      db.medication.count(),
      db.medication.findMany({ distinct: ['memberId'], select: { memberId: true } }),
    ])
    return distinctMembers.length > 0 ? totalMedications / distinctMembers.length : 0
  },

  // Aproximação "best-effort" do avgPerUser no fim do mês anterior — considera
  // só medicamentos/membros que já existiam antes do corte, sem contabilizar
  // retroativamente exclusões posteriores (sem infraestrutura de snapshot histórico).
  async averageMedicationsPerUserAsOf(cutoff: Date) {
    const [total, distinctMembers] = await Promise.all([
      db.medication.count({ where: { createdAt: { lt: cutoff } } }),
      db.medication.findMany({
        where: { createdAt: { lt: cutoff } },
        distinct: ['memberId'],
        select: { memberId: true },
      }),
    ])
    return distinctMembers.length > 0 ? total / distinctMembers.length : 0
  },

  // Versão paginada e agregada por tipo de medicamento (nome+mg), com todos os
  // filtros — usada pela tabela da tela. Pré-agrega os registros de dose num CTE
  // à parte (dose_stats) antes do LEFT JOIN final pra evitar fan-out (um join
  // direto medications x medication_dose_records multiplicaria as linhas e
  // corromperia COUNT(*)/AVG() do grupo).
  medicationsGrouped(filters: MedicationsFilters, pagination: { skip: number; take: number }) {
    const cte = buildFilteredMedicationsCte(filters)
    return db.$queryRaw<GroupedMedicationRow[]>(Prisma.sql`
      WITH ${cte},
      dose_stats AS (
        SELECT
          LOWER(f.name) AS name_key, f.dosage, f."dosageUnit",
          COUNT(*) FILTER (WHERE mdr.state = 'TAKEN')::bigint AS taken,
          COUNT(*) FILTER (WHERE mdr.state IN ('TAKEN', 'LATE'))::bigint AS taken_or_late
        FROM filtered f
        JOIN medication_dose_records mdr ON mdr."medicationId" = f.id AND mdr.state IN ('TAKEN', 'LATE')
        GROUP BY 1, 2, 3
      )
      SELECT
        mode() WITHIN GROUP (ORDER BY f.name) AS name,
        f.dosage,
        f."dosageUnit" AS "dosageUnit",
        mode() WITHIN GROUP (ORDER BY f.form) AS form,
        mode() WITHIN GROUP (ORDER BY f."stripeColor") AS "stripeColor",
        COUNT(*)::bigint AS "totalCount",
        ROUND(AVG(CASE WHEN f."continuousUse" THEN 1.0 ELSE 0 END) * 100, 1)::float8 AS "continuousUsePercent",
        COALESCE(MAX(ds.taken), 0)::bigint AS taken,
        COALESCE(MAX(ds.taken_or_late), 0)::bigint AS "takenOrLate"
      FROM filtered f
      LEFT JOIN dose_stats ds
        ON ds.name_key = LOWER(f.name) AND ds.dosage = f.dosage AND ds."dosageUnit" = f."dosageUnit"
      GROUP BY LOWER(f.name), f.dosage, f."dosageUnit"
      ORDER BY "totalCount" DESC
      LIMIT ${pagination.take} OFFSET ${pagination.skip}
    `)
  },

  async countMedicationsGrouped(filters: MedicationsFilters) {
    const cte = buildFilteredMedicationsCte(filters)
    const rows = await db.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      WITH ${cte}
      SELECT COUNT(*)::bigint AS total FROM (
        SELECT 1 FROM filtered GROUP BY LOWER(name), dosage, "dosageUnit"
      ) t
    `)
    return Number(rows[0]?.total ?? 0)
  },

  // Cidades distintas registradas por usuários daquele estado — alimenta o
  // select de Município (cascateado a partir do Estado) no painel de filtros
  // avançados, mesmo padrão de countUsersByCity().
  async distinctCitiesByState(state: string) {
    const rows = await db.user.findMany({
      where: {
        deletedAt: null,
        state,
        city: { not: null },
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
      },
      distinct: ['city'],
      select: { city: true },
      orderBy: { city: 'asc' },
    })
    return rows.map((row) => row.city as string)
  },

  // ── Churn ───────────────────────────────────────────────────────────────
  // Usado isoladamente pelo relatório de Crescimento (getGrowth) — não faz
  // parte do fluxo de churn em si, mantido separado de findAppUsersAtRisk.
  countAppUsersAtRisk(thresholdDate: Date) {
    return db.user.count({
      where: {
        deletedAt: null,
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
        OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }],
      },
    })
  },

  // Sem paginação aqui — a população "em risco" é buscada inteira e a
  // paginação/ordenação acontece em memória no service, igual ao padrão já
  // usado por loadSubscribedClients()/getClients (mesmo arquivo, reports.service.ts).
  findDoctorsAtRisk(filters: AtRiskFilters) {
    return db.doctor.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        user: { OR: [{ lastLoginAt: { lt: filters.thresholdDate } }, { lastLoginAt: null }] },
        ...(filters.planId && { planId: filters.planId }),
        ...(filters.status && { subscriptions: { some: { status: filters.status } } }),
        ...(filters.search && {
          OR: [
            { user: { name: { contains: filters.search, mode: 'insensitive' } } },
            { crmNumber: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        user: { select: { name: true, lastLoginAt: true, createdAt: true } },
        plan: { select: { name: true } },
      },
    })
  },

  findClinicsAtRisk(filters: AtRiskFilters) {
    return db.clinic.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        admins: {
          some: {
            user: { OR: [{ lastLoginAt: { lt: filters.thresholdDate } }, { lastLoginAt: null }] },
          },
        },
        ...(filters.planId && { planId: filters.planId }),
        ...(filters.status && { subscriptions: { some: { status: filters.status } } }),
        ...(filters.search && { tradeName: { contains: filters.search, mode: 'insensitive' } }),
      },
      include: {
        admins: {
          take: 1,
          include: { user: { select: { name: true, lastLoginAt: true, createdAt: true } } },
        },
        plan: { select: { name: true } },
      },
    })
  },

  findAppUsersAtRisk(filters: AtRiskFilters) {
    // Usuários finais (app-medcare) não têm Subscription/Plan — um filtro de
    // Status ou Plano nunca deve retornar nada para essa população.
    if (filters.status || filters.planId) return Promise.resolve([])
    return db.user.findMany({
      where: {
        deletedAt: null,
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
        OR: [{ lastLoginAt: { lt: filters.thresholdDate } }, { lastLoginAt: null }],
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
    })
  },

  // Evolução real de inatividade por mês: aplica a mesma regra de risco atual
  // (lastLoginAt vs. thresholdDays) retroativamente sobre a população ATUAL de
  // entidades ativas, usando o histórico real de audit_logs (action='LOGIN')
  // pra saber quando cada uma logou pela última vez antes do corte de cada mês.
  // Não reconstrói status histórico (se a entidade era ACTIVE naquele mês) —
  // simplificação aceitável, documentada no plano.
  async riskEvolutionByMonth(months: number, thresholdDays: number) {
    const [doctorsRows, clinicsRows, usersRows] = await Promise.all([
      db.$queryRaw<{ month: Date; count: bigint }[]>`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now()) - make_interval(months => (${months}::int - 1)),
            date_trunc('month', now()),
            interval '1 month'
          ) AS month
        )
        SELECT
          m.month,
          count(*) FILTER (
            WHERE d."createdAt" <= LEAST(m.month + interval '1 month', now())
              AND (ll.last_login IS NULL
                   OR ll.last_login < LEAST(m.month + interval '1 month', now()) - make_interval(days => ${thresholdDays}::int))
          )::bigint AS count
        FROM months m
        CROSS JOIN doctors d
        LEFT JOIN LATERAL (
          SELECT max(al."createdAt") AS last_login
          FROM audit_logs al
          WHERE al."actorId" = d."userId" AND al.action = 'LOGIN'
            AND al."createdAt" <= LEAST(m.month + interval '1 month', now())
        ) ll ON true
        WHERE d."deletedAt" IS NULL AND d.status = 'ACTIVE'
        GROUP BY m.month ORDER BY m.month
      `,
      db.$queryRaw<{ month: Date; count: bigint }[]>`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now()) - make_interval(months => (${months}::int - 1)),
            date_trunc('month', now()),
            interval '1 month'
          ) AS month
        )
        SELECT
          m.month,
          count(*) FILTER (
            WHERE c."createdAt" <= LEAST(m.month + interval '1 month', now())
              AND (ll.last_login IS NULL
                   OR ll.last_login < LEAST(m.month + interval '1 month', now()) - make_interval(days => ${thresholdDays}::int))
          )::bigint AS count
        FROM months m
        CROSS JOIN clinics c
        LEFT JOIN LATERAL (
          SELECT cap."userId" AS admin_user_id
          FROM clinic_admin_profiles cap
          WHERE cap."clinicId" = c.id
          ORDER BY cap.id
          LIMIT 1
        ) admin ON true
        LEFT JOIN LATERAL (
          SELECT max(al."createdAt") AS last_login
          FROM audit_logs al
          WHERE al."actorId" = admin.admin_user_id AND al.action = 'LOGIN'
            AND al."createdAt" <= LEAST(m.month + interval '1 month', now())
        ) ll ON true
        WHERE c."deletedAt" IS NULL AND c.status = 'ACTIVE'
        GROUP BY m.month ORDER BY m.month
      `,
      db.$queryRaw<{ month: Date; count: bigint }[]>`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now()) - make_interval(months => (${months}::int - 1)),
            date_trunc('month', now()),
            interval '1 month'
          ) AS month
        )
        SELECT
          m.month,
          count(*) FILTER (
            WHERE u."createdAt" <= LEAST(m.month + interval '1 month', now())
              AND (ll.last_login IS NULL
                   OR ll.last_login < LEAST(m.month + interval '1 month', now()) - make_interval(days => ${thresholdDays}::int))
          )::bigint AS count
        FROM months m
        CROSS JOIN users u
        LEFT JOIN LATERAL (
          SELECT max(al."createdAt") AS last_login
          FROM audit_logs al
          WHERE al."actorId" = u.id AND al.action = 'LOGIN'
            AND al."createdAt" <= LEAST(m.month + interval '1 month', now())
        ) ll ON true
        WHERE u."deletedAt" IS NULL AND u.role IN ('PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER')
        GROUP BY m.month ORDER BY m.month
      `,
    ])

    const byMonth = new Map<
      string,
      { month: Date; doctorsAtRisk: number; clinicsAtRisk: number; usersAtRisk: number }
    >()
    const key = (d: Date) => d.toISOString().slice(0, 7)
    for (const row of doctorsRows) {
      byMonth.set(key(row.month), {
        month: row.month,
        doctorsAtRisk: Number(row.count),
        clinicsAtRisk: 0,
        usersAtRisk: 0,
      })
    }
    for (const row of clinicsRows) {
      const entry = byMonth.get(key(row.month))
      if (entry) entry.clinicsAtRisk = Number(row.count)
    }
    for (const row of usersRows) {
      const entry = byMonth.get(key(row.month))
      if (entry) entry.usersAtRisk = Number(row.count)
    }
    return Array.from(byMonth.values()).sort((a, b) => a.month.getTime() - b.month.getTime())
  },
}
