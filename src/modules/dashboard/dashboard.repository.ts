import { db } from '../../config/database.js'

const APP_USER_ROLES = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] as const

export const dashboardRepository = {
  countClinicsByStatus() {
    return db.clinic.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    })
  },

  countDoctorsByStatus() {
    return db.doctor.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    })
  },

  countUsersByRole() {
    return db.user.groupBy({
      by: ['role'],
      where: { deletedAt: null, role: { in: [...APP_USER_ROLES] } },
      _count: { _all: true },
    })
  },

  // Aproximação: soma o basePrice do plano de cada assinatura ativa — não é o
  // valor efetivamente cobrado por ciclo (não há tabela de faturas/pagamentos).
  async sumActiveSubscriptionRevenue() {
    const subscriptions = await db.subscription.findMany({
      where: { status: 'ACTIVE' },
      select: { plan: { select: { basePrice: true } } },
    })
    return subscriptions.reduce(
      (total, subscription) => total + Number(subscription.plan.basePrice),
      0,
    )
  },

  // Novos cadastros de usuário final (app-medcare) por mês — substitui "downloads
  // por mês" (não há telemetria de instalação, ver plano de admin, Fase 5).
  monthlySignupSeries(months: number) {
    return db.$queryRaw<{ month: Date; count: bigint }[]>`
      SELECT date_trunc('month', "createdAt") AS month, count(*)::bigint AS count
      FROM users
      WHERE role IN ('PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER')
        AND "deletedAt" IS NULL
        AND "createdAt" >= now() - make_interval(months => ${months}::int)
      GROUP BY 1
      ORDER BY 1
    `
  },

  // Distribuição por plataforma via PushToken — real, sem mudança de schema.
  countByPlatform() {
    return db.pushToken.groupBy({
      by: ['platform'],
      _count: { _all: true },
    })
  },

  countCreatedSince(model: 'clinic' | 'doctor' | 'supplier', since: Date) {
    if (model === 'clinic') {
      return db.clinic.count({ where: { deletedAt: null, createdAt: { gte: since } } })
    }
    if (model === 'doctor') {
      return db.doctor.count({ where: { deletedAt: null, createdAt: { gte: since } } })
    }
    return db.supplier.count({ where: { createdAt: { gte: since } } })
  },

  // Estado com mais clínicas ativas — address é Json (sem coluna relacional pra
  // groupBy do Prisma), por isso precisa de $queryRaw com address->>'state'.
  async topClinicState() {
    const rows = await db.$queryRaw<{ state: string; count: bigint }[]>`
      SELECT address->>'state' AS state, count(*)::bigint AS count
      FROM clinics
      WHERE "deletedAt" IS NULL
        AND status = 'ACTIVE'
        AND address->>'state' IS NOT NULL
      GROUP BY address->>'state'
      ORDER BY count DESC
      LIMIT 1
    `
    const row = rows[0]
    return row ? { state: row.state, count: Number(row.count) } : null
  },

  // Especialidade com mais médicos cadastrados — specialties é String[], então
  // precisa de unnest() pra agrupar por item do array via $queryRaw.
  async topSpecialty() {
    const rows = await db.$queryRaw<{ specialty: string; count: bigint }[]>`
      SELECT unnest(specialties) AS specialty, count(*)::bigint AS count
      FROM doctors
      WHERE "deletedAt" IS NULL
        AND cardinality(specialties) > 0
      GROUP BY specialty
      ORDER BY count DESC
      LIMIT 1
    `
    const row = rows[0]
    return row ? { specialty: row.specialty, count: Number(row.count) } : null
  },

  async sumSubscriptionRevenueAt(statuses: ('ACTIVE' | 'LATE')[], asOf?: Date) {
    const subscriptions = await db.subscription.findMany({
      where: {
        status: { in: statuses },
        ...(asOf && { createdAt: { lt: asOf } }),
      },
      select: { plan: { select: { basePrice: true } } },
    })
    return subscriptions.reduce(
      (total, subscription) => total + Number(subscription.plan.basePrice),
      0,
    )
  },

  monthlyDownloadSeries(months: number) {
    return db.$queryRaw<{ month: Date; count: bigint }[]>`
      SELECT date_trunc('month', date) AS month, sum("downloadCount")::bigint AS count
      FROM store_download_snapshots
      WHERE date >= now() - make_interval(months => ${months}::int)
      GROUP BY 1
      ORDER BY 1
    `
  },

  sumDownloadsInRange(startDate: Date, endDate: Date) {
    return db.storeDownloadSnapshot.aggregate({
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { downloadCount: true },
    })
  },

  sumAllDownloads() {
    return db.storeDownloadSnapshot.aggregate({
      _sum: { downloadCount: true },
    })
  },
}
