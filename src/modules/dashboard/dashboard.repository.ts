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
}
