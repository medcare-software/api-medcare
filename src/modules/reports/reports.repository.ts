import type { MedicationStripeColor } from '@prisma/client'

import { db } from '../../config/database.js'

const SUBSCRIBED_STATUSES = ['ACTIVE', 'LATE'] as const

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

  countAccessGrantsAccessed() {
    return db.medicalAccessGrant.count({ where: { lastAccessedAt: { not: null } } })
  },

  countExamsBySource(source: 'DOCTOR' | 'MANUAL' | 'GMAIL') {
    return db.exam.count({ where: { source } })
  },

  countActiveDoctors() {
    return db.doctor.count({ where: { deletedAt: null, status: 'ACTIVE' } })
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

  findActiveSubscriptionsWithPlan() {
    return db.subscription.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, planId: true, extraDoctorsCount: true, plan: true },
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

  countUsersByCity() {
    return db.user.groupBy({
      by: ['city', 'state'],
      where: {
        deletedAt: null,
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
        city: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
      take: 5,
    })
  },

  // ── Medicamentos ──────────────────────────────────────────────────────
  medicationsRanking() {
    return db.medication.groupBy({
      by: ['name'],
      _count: { _all: true },
      orderBy: { _count: { name: 'desc' } },
      take: 10,
    })
  },

  tarjaDistribution() {
    return db.medication.groupBy({
      by: ['stripeColor'],
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

  findMedications(
    filters: {
      search?: string
      stripeColor?: MedicationStripeColor
      continuousUse?: boolean
      state?: string
    },
    pagination: { skip: number; take: number },
  ) {
    return db.medication.findMany({
      where: {
        ...(filters.search && { name: { contains: filters.search, mode: 'insensitive' } }),
        ...(filters.stripeColor && { stripeColor: filters.stripeColor }),
        ...(filters.continuousUse !== undefined && { continuousUse: filters.continuousUse }),
        ...(filters.state && { member: { user: { state: filters.state } } }),
      },
      include: { member: { select: { user: { select: { state: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countMedicationsFiltered(filters: {
    search?: string
    stripeColor?: MedicationStripeColor
    continuousUse?: boolean
    state?: string
  }) {
    return db.medication.count({
      where: {
        ...(filters.search && { name: { contains: filters.search, mode: 'insensitive' } }),
        ...(filters.stripeColor && { stripeColor: filters.stripeColor }),
        ...(filters.continuousUse !== undefined && { continuousUse: filters.continuousUse }),
        ...(filters.state && { member: { user: { state: filters.state } } }),
      },
    })
  },

  // ── Churn ───────────────────────────────────────────────────────────────
  findDoctorsAtRisk(thresholdDate: Date, pagination: { skip: number; take: number }) {
    return db.doctor.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        user: { OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }] },
      },
      include: {
        user: { select: { name: true, lastLoginAt: true, createdAt: true } },
        plan: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countDoctorsAtRisk(thresholdDate: Date) {
    return db.doctor.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        user: { OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }] },
      },
    })
  },

  findClinicsAtRisk(thresholdDate: Date, pagination: { skip: number; take: number }) {
    return db.clinic.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        admins: {
          some: { user: { OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }] } },
        },
      },
      include: {
        admins: {
          take: 1,
          include: { user: { select: { name: true, lastLoginAt: true, createdAt: true } } },
        },
        plan: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countClinicsAtRisk(thresholdDate: Date) {
    return db.clinic.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        admins: {
          some: { user: { OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }] } },
        },
      },
    })
  },

  findAppUsersAtRisk(thresholdDate: Date, pagination: { skip: number; take: number }) {
    return db.user.findMany({
      where: {
        deletedAt: null,
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
        OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }],
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  countAppUsersAtRisk(thresholdDate: Date) {
    return db.user.count({
      where: {
        deletedAt: null,
        role: { in: ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] },
        OR: [{ lastLoginAt: { lt: thresholdDate } }, { lastLoginAt: null }],
      },
    })
  },
}
