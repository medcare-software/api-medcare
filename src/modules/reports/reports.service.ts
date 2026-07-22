import { auditLogsRepository } from '../audit-logs/audit-logs.repository.js'
import { clinicsRepository } from '../clinics/clinics.repository.js'
import { dashboardRepository } from '../dashboard/dashboard.repository.js'
import { doctorsRepository } from '../doctors/doctors.repository.js'
import { financialRepository } from '../financial/financial.repository.js'
import { plansRepository } from '../plans/plans.repository.js'
import { storeAnalyticsService } from '../store-analytics/store-analytics.service.js'
import { reportsRepository } from './reports.repository.js'
import type {
  ChurnReportQuery,
  ListReportPageQuery,
  MedicationsReportQuery,
} from './reports.schema.js'

type ClinicWithSub = Awaited<
  ReturnType<typeof reportsRepository.findClinicsWithSubscription>
>[number]
type DoctorWithSub = Awaited<
  ReturnType<typeof reportsRepository.findDoctorsWithSubscription>
>[number]

function toClientRow(row: ClinicWithSub | DoctorWithSub) {
  const isClinic = 'tradeName' in row
  const subscription = row.subscriptions[0]
  const monthlyValueCents = subscription
    ? Math.round(
        (Number(subscription.plan.basePrice) +
          subscription.extraDoctorsCount * Number(subscription.plan.extraMemberFee ?? 0)) *
          100,
      )
    : 0
  return {
    id: row.id,
    name: isClinic ? (row as ClinicWithSub).tradeName : (row as DoctorWithSub).user.name,
    type: isClinic ? ('CLINIC' as const) : ('DOCTOR' as const),
    planName: subscription?.plan.name ?? null,
    monthlyValueCents,
    status: subscription?.status ?? null,
    createdAt: row.createdAt,
  }
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total: items.length }
}

async function loadSubscribedClients() {
  const [clinics, doctors] = await Promise.all([
    reportsRepository.findClinicsWithSubscription(),
    reportsRepository.findDoctorsWithSubscription(),
  ])
  return [...clinics.map(toClientRow), ...doctors.map(toClientRow)]
}

export const reportsService = {
  // ── 1. Clientes ──────────────────────────────────────────────────────────
  async getClients(query: ListReportPageQuery) {
    const [clients, activeClinics, activeDoctors, monthlySignups] = await Promise.all([
      loadSubscribedClients(),
      dashboardRepository.countClinicsByStatus(),
      dashboardRepository.countDoctorsByStatus(),
      dashboardRepository.monthlySignupSeries(12),
    ])

    const activeClinicsCount =
      activeClinics.find((row) => row.status === 'ACTIVE')?._count._all ?? 0
    const activeDoctorsCount =
      activeDoctors.find((row) => row.status === 'ACTIVE')?._count._all ?? 0

    let cumulative = 0
    const growth = monthlySignups.map((row) => {
      cumulative += Number(row.count)
      return {
        month: row.month.toISOString().slice(0, 7),
        newSignups: Number(row.count),
        cumulativeUsers: cumulative,
      }
    })

    const sortedByRevenue = [...clients].sort((a, b) => b.monthlyValueCents - a.monthlyValueCents)
    const { items, total } = paginate(sortedByRevenue, query.page, query.pageSize)

    return {
      kpis: {
        totalClients: clients.length,
        activeClinics: activeClinicsCount,
        activeDoctors: activeDoctorsCount,
      },
      growth,
      topClients: { items, total },
    }
  },

  // ── 2. Médicos e clínicas ────────────────────────────────────────────────
  async getDoctorsClinics(query: ListReportPageQuery) {
    const [
      activeDoctorsCount,
      activeClinicsByStatus,
      recordsAccessed,
      examsSent,
      specialties,
      stateDistribution,
      doctors,
      total,
    ] = await Promise.all([
      reportsRepository.countActiveDoctors(),
      dashboardRepository.countClinicsByStatus(),
      reportsRepository.countAccessGrantsAccessed(),
      reportsRepository.countExamsBySource('DOCTOR'),
      reportsRepository.specialtiesRanking(),
      Promise.all([
        reportsRepository.clinicsCountByState(),
        reportsRepository.doctorsCountByState(),
      ]),
      reportsRepository.findActiveDoctors({
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      reportsRepository.countActiveDoctors(),
    ])

    const activeClinicsCount =
      activeClinicsByStatus.find((row) => row.status === 'ACTIVE')?._count._all ?? 0

    const [clinicsByState, doctorsByState] = stateDistribution
    const stateMap = new Map<
      string,
      { state: string; clinicsCount: number; doctorsCount: number }
    >()
    for (const row of clinicsByState) {
      stateMap.set(row.state, {
        state: row.state,
        clinicsCount: Number(row.count),
        doctorsCount: 0,
      })
    }
    for (const row of doctorsByState) {
      const existing = stateMap.get(row.state)
      if (existing) existing.doctorsCount = Number(row.count)
      else
        stateMap.set(row.state, {
          state: row.state,
          clinicsCount: 0,
          doctorsCount: Number(row.count),
        })
    }

    const doctorRows = await Promise.all(
      doctors.map(async (doctor) => {
        const [doctorRecordsAccessed, doctorExamsSent, doctorExamsRegistered] = await Promise.all([
          reportsRepository.countAccessGrantsAccessedByDoctor(doctor.id),
          reportsRepository.countExamsSentByDoctor(doctor.id),
          reportsRepository.countExamsRegisteredByDoctor(doctor.id),
        ])
        return {
          id: doctor.id,
          name: doctor.user.name,
          specialty: doctor.specialties[0] ?? null,
          recordsAccessed: doctorRecordsAccessed,
          examsSent: doctorExamsSent,
          examsRegistered: doctorExamsRegistered,
        }
      }),
    )

    return {
      kpis: {
        activeDoctors: activeDoctorsCount,
        activeClinics: activeClinicsCount,
        recordsAccessed,
        examsSent,
      },
      topSpecialties: specialties.map((row) => ({
        specialty: row.specialty,
        count: Number(row.count),
      })),
      stateDistribution: Array.from(stateMap.values()),
      activeDoctors: { items: doctorRows, total },
    }
  },

  // ── 3. Planos ────────────────────────────────────────────────────────────
  async getPlans(query: ListReportPageQuery) {
    const [activePlansCount, activeSubscriptions, movementLogs] = await Promise.all([
      reportsRepository.countActivePlans(),
      reportsRepository.findActiveSubscriptionsWithPlan(),
      auditLogsRepository.findMany(
        { targetType: 'Subscription' },
        { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
      ),
    ])
    const movementsTotal = await auditLogsRepository.count({ targetType: 'Subscription' })

    const monthlyRevenueCents = Math.round(
      activeSubscriptions.reduce((sum, sub) => sum + Number(sub.plan.basePrice) * 100, 0),
    )
    const extraRevenueCents = Math.round(
      activeSubscriptions.reduce(
        (sum, sub) => sum + sub.extraDoctorsCount * Number(sub.plan.extraMemberFee ?? 0) * 100,
        0,
      ),
    )

    const distributionMap = new Map<
      string,
      { planId: string; planName: string; type: string; count: number }
    >()
    for (const sub of activeSubscriptions) {
      const existing = distributionMap.get(sub.planId)
      if (existing) existing.count += 1
      else
        distributionMap.set(sub.planId, {
          planId: sub.planId,
          planName: sub.plan.name,
          type: sub.plan.type,
          count: 1,
        })
    }
    const revenueMap = new Map<string, { planId: string; planName: string; revenueCents: number }>()
    for (const sub of activeSubscriptions) {
      const revenue = Math.round(
        (Number(sub.plan.basePrice) +
          sub.extraDoctorsCount * Number(sub.plan.extraMemberFee ?? 0)) *
          100,
      )
      const existing = revenueMap.get(sub.planId)
      if (existing) existing.revenueCents += revenue
      else
        revenueMap.set(sub.planId, {
          planId: sub.planId,
          planName: sub.plan.name,
          revenueCents: revenue,
        })
    }

    const movements = await Promise.all(
      movementLogs.map(async (log) => {
        const subscription = await plansRepository.findSubscriptionById(log.targetId)
        if (!subscription) {
          return {
            id: log.id,
            action: log.action,
            clientName: null,
            planName: null,
            actorName: log.actor?.name ?? null,
            createdAt: log.createdAt,
          }
        }

        const [plan, clinic, doctor] = await Promise.all([
          plansRepository.findById(subscription.planId),
          subscription.clinicId ? clinicsRepository.findById(subscription.clinicId) : null,
          subscription.doctorId ? doctorsRepository.findById(subscription.doctorId) : null,
        ])

        return {
          id: log.id,
          action: log.action,
          clientName: clinic?.tradeName ?? doctor?.user.name ?? null,
          planName: plan?.name ?? null,
          actorName: log.actor?.name ?? null,
          createdAt: log.createdAt,
        }
      }),
    )

    return {
      kpis: { activePlansCount, monthlyRevenueCents, extraRevenueCents },
      distribution: Array.from(distributionMap.values()),
      revenueRanking: Array.from(revenueMap.values()).sort(
        (a, b) => b.revenueCents - a.revenueCents,
      ),
      movements: { items: movements, total: movementsTotal },
    }
  },

  // ── 4. Financeiro ────────────────────────────────────────────────────────
  async getFinancial(query: ListReportPageQuery) {
    const [payableSummary, receivableSummary, payableByCategory, clients] = await Promise.all([
      financialRepository.summarizeAccountsPayable(),
      financialRepository.summarizeReceivables(),
      reportsRepository.payableSumByCategory(),
      loadSubscribedClients(),
    ])

    const averageTicketCents =
      receivableSummary.totalCount > 0
        ? Math.round(receivableSummary.totalMonthlyCents / receivableSummary.totalCount)
        : 0

    const sortedByDate = [...clients].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const { items, total } = paginate(sortedByDate, query.page, query.pageSize)

    return {
      kpis: {
        monthlyBilledCents: receivableSummary.totalMonthlyCents,
        overdueCents: payableSummary.overdueCents,
        pendingPayableCents: payableSummary.pendingCents,
        paidThisMonthCents: payableSummary.paidThisMonthCents,
        averageTicketCents,
      },
      // Sem histórico de faturas emitidas por mês (não há tabela de invoices) —
      // evolução mensal de faturamento fica de fora em vez de inventar um dado
      // que o sistema não tem como derivar com precisão.
      evolutionAvailable: false,
      receivableBreakdown: {
        totalCents: receivableSummary.totalMonthlyCents,
        byStatus: [
          { status: 'RECEIVED', count: receivableSummary.receivedCount },
          { status: 'PENDING', count: receivableSummary.pendingCount },
          { status: 'OVERDUE', count: receivableSummary.overdueCount },
        ],
      },
      payableBreakdown: {
        items: payableByCategory.map((row) => ({
          category: row.category,
          count: row._count._all,
          valueCents: row._sum.valueCents ?? 0,
        })),
      },
      newClients: { items, total },
    }
  },

  // ── 5. Crescimento do app ────────────────────────────────────────────────
  async getGrowth() {
    const [monthlySignups, platformBreakdown, roleBreakdown, stateBreakdown, storeDownloads] =
      await Promise.all([
        dashboardRepository.monthlySignupSeries(12),
        dashboardRepository.countByPlatform(),
        dashboardRepository.countUsersByRole(),
        reportsRepository.countUsersByState(),
        storeAnalyticsService.getAggregatedDownloads({ days: 30 }),
      ])

    let cumulative = 0
    const series = monthlySignups.map((row) => {
      cumulative += Number(row.count)
      return {
        month: row.month.toISOString().slice(0, 7),
        newSignups: Number(row.count),
        cumulativeUsers: cumulative,
      }
    })

    const totalSignups = cumulative
    const newSignupsThisMonth = series.length > 0 ? (series.at(-1)?.newSignups ?? 0) : 0

    return {
      kpis: { totalSignups, newSignupsThisMonth },
      series,
      stateDistribution: stateBreakdown.map((row) => ({
        state: row.state ?? 'Não informado',
        count: row._count._all,
      })),
      platformDistribution: platformBreakdown.map((row) => ({
        platform: row.platform,
        count: row._count._all,
      })),
      profileDistribution: roleBreakdown.map((row) => ({ role: row.role, count: row._count._all })),
      // Downloads brutos por loja (App Store Connect/Google Play) — por
      // plataforma/período, sem geografia nem vínculo com usuário individual.
      // `configured` indica quais integrações têm credenciais habilitadas.
      storeDownloads: storeDownloads,
    }
  },

  // ── 6. Medicamentos ──────────────────────────────────────────────────────
  async getMedications(query: MedicationsReportQuery) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const filters = {
      ...(query.search && { search: query.search }),
      ...(query.stripeColor && { stripeColor: query.stripeColor }),
      ...(query.continuousUse !== undefined && { continuousUse: query.continuousUse }),
      ...(query.state && { state: query.state }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }

    const [
      total,
      medications,
      ranking,
      tarja,
      totalMedications,
      continuousUseCount,
      createdThisMonth,
      distinctMembers,
    ] = await Promise.all([
      reportsRepository.countMedicationsFiltered(filters),
      reportsRepository.findMedications(filters, pagination),
      reportsRepository.medicationsRanking(),
      reportsRepository.tarjaDistribution(),
      reportsRepository.countMedications(),
      reportsRepository.countMedicationsContinuousUse(),
      reportsRepository.countMedicationsCreatedSince(startOfMonth),
      reportsRepository.countDistinctMedicationMembers(),
    ])

    const avgPerUser = distinctMembers.length > 0 ? totalMedications / distinctMembers.length : 0

    return {
      kpis: {
        totalMedications,
        continuousUseCount,
        createdThisMonth,
        avgPerUser: Math.round(avgPerUser * 10) / 10,
      },
      topMedications: ranking.map((row) => ({ name: row.name, count: row._count._all })),
      tarjaDistribution: tarja.map((row) => ({
        stripeColor: row.stripeColor,
        count: row._count._all,
      })),
      items: {
        items: medications.map((medication) => ({
          id: medication.id,
          name: medication.name,
          form: medication.form,
          stripeColor: medication.stripeColor,
          continuousUse: medication.continuousUse,
          active: medication.active,
          state: medication.member.user?.state ?? null,
          createdAt: medication.createdAt,
        })),
        total,
      },
    }
  },

  // ── 7. Churn ──────────────────────────────────────────────────────────────
  async getChurn(query: ChurnReportQuery) {
    const thresholdDate = new Date()
    thresholdDate.setDate(thresholdDate.getDate() - query.thresholdDays)
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }

    const [doctorsAtRiskCount, clinicsAtRiskCount, usersAtRiskCount] = await Promise.all([
      reportsRepository.countDoctorsAtRisk(thresholdDate),
      reportsRepository.countClinicsAtRisk(thresholdDate),
      reportsRepository.countAppUsersAtRisk(thresholdDate),
    ])

    let rows: {
      id: string
      name: string
      planName: string | null
      lastLoginAt: Date | null
      createdAt: Date
    }[] = []
    let total = 0

    if (query.tab === 'doctors') {
      const [doctors, count] = await Promise.all([
        reportsRepository.findDoctorsAtRisk(thresholdDate, pagination),
        reportsRepository.countDoctorsAtRisk(thresholdDate),
      ])
      rows = doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.user.name,
        planName: doctor.plan?.name ?? null,
        lastLoginAt: doctor.user.lastLoginAt,
        createdAt: doctor.user.createdAt,
      }))
      total = count
    } else if (query.tab === 'clinics') {
      const [clinics, count] = await Promise.all([
        reportsRepository.findClinicsAtRisk(thresholdDate, pagination),
        reportsRepository.countClinicsAtRisk(thresholdDate),
      ])
      rows = clinics.map((clinic) => ({
        id: clinic.id,
        name: clinic.tradeName,
        planName: clinic.plan?.name ?? null,
        lastLoginAt: clinic.admins[0]?.user.lastLoginAt ?? null,
        createdAt: clinic.admins[0]?.user.createdAt ?? clinic.createdAt,
      }))
      total = count
    } else {
      const [users, count] = await Promise.all([
        reportsRepository.findAppUsersAtRisk(thresholdDate, pagination),
        reportsRepository.countAppUsersAtRisk(thresholdDate),
      ])
      rows = users.map((user) => ({
        id: user.id,
        name: user.name,
        planName: null,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      }))
      total = count
    }

    return {
      kpis: {
        doctorsAtRisk: doctorsAtRiskCount,
        clinicsAtRisk: clinicsAtRiskCount,
        usersAtRisk: usersAtRiskCount,
      },
      // Sem snapshots históricos de status — mostramos só a situação atual por
      // limiar de inatividade, não uma série temporal fabricada.
      evolutionAvailable: false,
      distribution: [
        { segment: 'doctors', count: doctorsAtRiskCount },
        { segment: 'clinics', count: clinicsAtRiskCount },
        { segment: 'users', count: usersAtRiskCount },
      ],
      rows: { items: rows, total },
    }
  },
}
