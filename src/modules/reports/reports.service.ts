import { auditLogsRepository } from '../audit-logs/audit-logs.repository.js'
import { clinicsRepository } from '../clinics/clinics.repository.js'
import { dashboardRepository } from '../dashboard/dashboard.repository.js'
import { doctorsRepository } from '../doctors/doctors.repository.js'
import { financialRepository } from '../financial/financial.repository.js'
import { plansRepository } from '../plans/plans.repository.js'
import { storeAnalyticsService } from '../store-analytics/store-analytics.service.js'
import { usersRepository } from '../users/users.repository.js'
import type { AtRiskFilters } from './reports.repository.js'
import { reportsRepository } from './reports.repository.js'
import type {
  ChurnReportQuery,
  ListReportPageQuery,
  MedicationsReportQuery,
} from './reports.schema.js'

function percentDelta(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null
}

const DAY_MS = 24 * 60 * 60 * 1000

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
    planId: subscription?.plan.id ?? null,
    planName: subscription?.plan.name ?? null,
    monthlyValueCents,
    // Só a parcela de médicos excedentes do valor cobrado — usada isoladamente
    // pelo KPI "Receita de excedentes" do relatório de Planos.
    extraFeeCents: subscription
      ? Math.round(
          subscription.extraDoctorsCount * Number(subscription.plan.extraMemberFee ?? 0) * 100,
        )
      : 0,
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

type ChurnEntityType = 'DOCTOR' | 'CLINIC' | 'USER'
type ChurnUnifiedRow = {
  id: string
  type: ChurnEntityType
  name: string
  planName: string | null
  createdAt: Date
  lastLoginAt: Date | null
}

async function loadAtRiskRows(filters: AtRiskFilters) {
  const [doctors, clinics, users] = await Promise.all([
    reportsRepository.findDoctorsAtRisk(filters),
    reportsRepository.findClinicsAtRisk(filters),
    reportsRepository.findAppUsersAtRisk(filters),
  ])
  return {
    doctors: doctors.map(
      (doctor): ChurnUnifiedRow => ({
        id: doctor.id,
        type: 'DOCTOR',
        name: doctor.user.name,
        planName: doctor.plan?.name ?? null,
        createdAt: doctor.user.createdAt,
        lastLoginAt: doctor.user.lastLoginAt,
      }),
    ),
    clinics: clinics.map(
      (clinic): ChurnUnifiedRow => ({
        id: clinic.id,
        type: 'CLINIC',
        name: clinic.tradeName,
        planName: clinic.plan?.name ?? null,
        createdAt: clinic.admins[0]?.user.createdAt ?? clinic.createdAt,
        lastLoginAt: clinic.admins[0]?.user.lastLoginAt ?? null,
      }),
    ),
    users: users.map(
      (user): ChurnUnifiedRow => ({
        id: user.id,
        type: 'USER',
        name: user.name,
        planName: null,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      }),
    ),
  }
}

function sortChurnRows(
  rows: ChurnUnifiedRow[],
  sortBy: ChurnReportQuery['sortBy'],
  sortDir: ChurnReportQuery['sortDir'],
  now: Date,
) {
  const dir = sortDir === 'asc' ? 1 : -1
  const inactiveDaysOf = (row: ChurnUnifiedRow) =>
    Math.floor((now.getTime() - (row.lastLoginAt ?? row.createdAt).getTime()) / DAY_MS)

  return [...rows].sort((a, b) => {
    if (sortBy === 'name') return dir * a.name.localeCompare(b.name)
    if (sortBy === 'lastLoginAt') {
      return dir * ((a.lastLoginAt?.getTime() ?? 0) - (b.lastLoginAt?.getTime() ?? 0))
    }
    if (sortBy === 'inactiveDays') return dir * (inactiveDaysOf(a) - inactiveDaysOf(b))
    return dir * (a.createdAt.getTime() - b.createdAt.getTime())
  })
}

export const reportsService = {
  // ── 1. Clientes ──────────────────────────────────────────────────────────
  async getClients(query: ListReportPageQuery) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [
      clients,
      activeClinics,
      activeDoctors,
      monthlySignups,
      appUsersByRole,
      activeClinicsDelta,
      activeDoctorsDelta,
    ] = await Promise.all([
      loadSubscribedClients(),
      dashboardRepository.countClinicsByStatus(),
      dashboardRepository.countDoctorsByStatus(),
      dashboardRepository.monthlySignupSeries(12),
      dashboardRepository.countUsersByRole(),
      dashboardRepository.countCreatedSince('clinic', startOfMonth),
      dashboardRepository.countCreatedSince('doctor', startOfMonth),
    ])

    const activeClinicsCount =
      activeClinics.find((row) => row.status === 'ACTIVE')?._count._all ?? 0
    const activeDoctorsCount =
      activeDoctors.find((row) => row.status === 'ACTIVE')?._count._all ?? 0
    const appUsersCount = appUsersByRole.reduce((sum, row) => sum + row._count._all, 0)
    const totalClientsDelta = clients.filter((client) => client.createdAt >= startOfMonth).length

    let cumulative = 0
    const growth = monthlySignups.map((row) => {
      cumulative += Number(row.count)
      return {
        month: row.month.toISOString().slice(0, 7),
        newSignups: Number(row.count),
        cumulativeUsers: cumulative,
      }
    })
    const appUsersDelta = growth.length > 0 ? (growth.at(-1)?.newSignups ?? 0) : 0

    const sortedByRevenue = [...clients].sort((a, b) => b.monthlyValueCents - a.monthlyValueCents)
    const { items, total } = paginate(sortedByRevenue, query.page, query.pageSize)

    return {
      kpis: {
        totalClients: clients.length,
        appUsers: appUsersCount,
        activeClinics: activeClinicsCount,
        activeDoctors: activeDoctorsCount,
        totalClientsDelta,
        appUsersDelta,
        activeClinicsDelta,
        activeDoctorsDelta,
      },
      growth,
      topClients: { items, total },
    }
  },

  // ── 2. Médicos e clínicas ────────────────────────────────────────────────
  async getDoctorsClinics(query: ListReportPageQuery) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [
      activeDoctorsByLinkage,
      activeClinicsByStatus,
      activeClinicsDelta,
      recordsAccessed,
      examsSentByDoctor,
      examsSentByClinic,
      specialties,
      stateDistribution,
      doctors,
      total,
    ] = await Promise.all([
      reportsRepository.countActiveDoctorsByClinicLinkage(),
      dashboardRepository.countClinicsByStatus(),
      dashboardRepository.countCreatedSince('clinic', startOfMonth),
      reportsRepository.countDistinctPatientsWithDoctorAccess(),
      reportsRepository.countExamsBySource('DOCTOR'),
      reportsRepository.countExamsBySource('CLINIC'),
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
    const examsSent = examsSentByDoctor + examsSentByClinic

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
        activeDoctorsTotal: activeDoctorsByLinkage.total,
        activeDoctorsSolo: activeDoctorsByLinkage.solo,
        activeDoctorsVinculados: activeDoctorsByLinkage.linked,
        activeClinics: activeClinicsCount,
        activeClinicsDelta,
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
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const [
      activePlansCount,
      activePlansByType,
      subscribedClients,
      movementLogs,
      currentMonthPayments,
      previousMonthPayments,
    ] = await Promise.all([
      reportsRepository.countActivePlans(),
      reportsRepository.countActivePlansByType(),
      // Clínicas (inclui hospital/consultório/laboratório, todos institutionType
      // de Clinic) + médicos com assinatura ativa/atrasada e não deletados — mesma
      // fonte do relatório de Clientes, garante que só cliente real e com plano
      // de fato vinculado entra na distribuição/receita por plano abaixo.
      loadSubscribedClients(),
      auditLogsRepository.findMany(
        { targetType: 'Subscription' },
        { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
      ),
      reportsRepository.paymentsTotalForMonth(currentMonthStart),
      reportsRepository.paymentsTotalForMonth(previousMonthStart),
    ])
    const movementsTotal = await auditLogsRepository.count({ targetType: 'Subscription' })

    const clinicsCount = activePlansByType.find((row) => row.type === 'CLINIC')?._count._all ?? 0
    const doctorsCount = activePlansByType.find((row) => row.type === 'DOCTOR')?._count._all ?? 0

    const monthlyRevenueCents = Math.round(
      subscribedClients.reduce(
        (sum, client) => sum + (client.monthlyValueCents - client.extraFeeCents),
        0,
      ),
    )
    const extraRevenueCents = Math.round(
      subscribedClients.reduce((sum, client) => sum + client.extraFeeCents, 0),
    )

    const currentInvoicedCents = currentMonthPayments._sum.amountCents ?? 0
    const previousInvoicedCents = previousMonthPayments._sum.amountCents ?? 0
    const revenueDeltaPercent =
      previousInvoicedCents > 0
        ? Math.round(((currentInvoicedCents - previousInvoicedCents) / previousInvoicedCents) * 100)
        : null

    const distributionMap = new Map<
      string,
      { planId: string; planName: string; type: string; count: number }
    >()
    const revenueMap = new Map<string, { planId: string; planName: string; revenueCents: number }>()
    for (const client of subscribedClients) {
      if (!client.planId || !client.planName) continue

      const existingDistribution = distributionMap.get(client.planId)
      if (existingDistribution) existingDistribution.count += 1
      else
        distributionMap.set(client.planId, {
          planId: client.planId,
          planName: client.planName,
          type: client.type,
          count: 1,
        })

      const existingRevenue = revenueMap.get(client.planId)
      if (existingRevenue) existingRevenue.revenueCents += client.monthlyValueCents
      else
        revenueMap.set(client.planId, {
          planId: client.planId,
          planName: client.planName,
          revenueCents: client.monthlyValueCents,
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
      kpis: {
        activePlansCount,
        activePlansBreakdown: { clinicsCount, doctorsCount },
        monthlyRevenueCents,
        revenueDeltaPercent,
        extraRevenueCents,
      },
      distribution: Array.from(distributionMap.values()),
      revenueRanking: Array.from(revenueMap.values())
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 4),
      movements: { items: movements, total: movementsTotal },
    }
  },

  // ── 4. Financeiro ────────────────────────────────────────────────────────
  async getFinancial(query: ListReportPageQuery) {
    const [payableSummary, payableByCategory, receivableSummary, evolutionRows, clients] =
      await Promise.all([
        financialRepository.summarizeAccountsPayable(),
        financialRepository.summarizePayableByCategory(),
        financialRepository.summarizeReceivables(),
        reportsRepository.paymentEvolutionByMonth(),
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

    const evolutionByMonth = new Map(evolutionRows.map((row) => [row.month, row]))
    const evolution = Array.from({ length: 12 }, (_, index) => {
      const row = evolutionByMonth.get(index + 1)
      return {
        month: index + 1,
        invoicedCents: Number(row?.invoicedCents ?? 0),
        receivedCents: Number(row?.receivedCents ?? 0),
        overdueCents: Number(row?.overdueCents ?? 0),
      }
    })

    return {
      kpis: {
        // Faturamento líquido = recebido dos clientes - pago pela empresa aos fornecedores.
        netRevenueCents: receivableSummary.receivedCents - payableSummary.paidThisMonthCents,
        receivedCents: receivableSummary.receivedCents,
        overdueReceivableCents: receivableSummary.overdueCents,
        averageTicketCents,
      },
      evolutionAvailable: true,
      evolution,
      receivableBreakdown: {
        totalCents: receivableSummary.totalMonthlyCents,
        byStatus: [
          { status: 'RECEIVED', valueCents: receivableSummary.receivedCents },
          { status: 'PENDING', valueCents: receivableSummary.pendingCents },
          { status: 'OVERDUE', valueCents: receivableSummary.overdueCents },
        ],
      },
      payableBreakdown: {
        totalCents:
          payableSummary.paidThisMonthCents +
          payableSummary.pendingCents +
          payableSummary.overdueCents,
        byStatus: [
          { status: 'PAID', valueCents: payableSummary.paidThisMonthCents },
          { status: 'PENDING', valueCents: payableSummary.pendingCents },
          { status: 'OVERDUE', valueCents: payableSummary.overdueCents },
        ],
        categoryTotalCents: payableSummary.pendingCents + payableSummary.overdueCents,
        byCategory: payableByCategory,
      },
      newClients: { items, total },
    }
  },

  // ── 5. Crescimento do app ────────────────────────────────────────────────
  async getGrowth(state?: string) {
    const thresholdDate = new Date()
    thresholdDate.setDate(thresholdDate.getDate() - 30)

    const [
      monthlySignups,
      platformBreakdown,
      roleBreakdown,
      stateBreakdown,
      storeDownloads,
      usersAtRisk,
      avgMedicationsPerUser,
      topMunicipalitiesRows,
    ] = await Promise.all([
      dashboardRepository.monthlySignupSeries(12),
      dashboardRepository.countByPlatform(),
      dashboardRepository.countUsersByRole(),
      reportsRepository.countUsersByState(),
      storeAnalyticsService.getAggregatedDownloads({ days: 30 }),
      reportsRepository.countAppUsersAtRisk(thresholdDate),
      reportsRepository.averageMedicationsPerUser(),
      reportsRepository.countUsersByCity(state),
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
    const totalAppUsers = roleBreakdown.reduce((sum, row) => sum + row._count._all, 0)
    const totalDownloadsFromStores = storeDownloads.totalsByPlatform.reduce(
      (sum, row) => sum + row.totalDownloads,
      0,
    )
    // Sem downloads de loja configurados, usamos o total de cadastros como
    // aproximação (mesmo padrão de fallback já usado no card de downloads por loja).
    const totalDownloads =
      storeDownloads.configured.ios || storeDownloads.configured.android
        ? totalDownloadsFromStores
        : totalSignups
    const retentionRate = totalAppUsers > 0 ? 1 - usersAtRisk / totalAppUsers : 0

    return {
      kpis: {
        totalDownloads,
        newSignupsThisMonth,
        retentionRate: Math.round(retentionRate * 1000) / 1000,
        avgMedicationsPerUser: Math.round(avgMedicationsPerUser * 10) / 10,
      },
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
      // Só cadastros feitos depois do campo `city` existir têm cidade — base
      // antiga fica de fora do ranking (mesma ressalva já aplicada ao `state`).
      topMunicipalities: topMunicipalitiesRows.map((row) => ({
        city: row.city as string,
        state: row.state ?? 'N/D',
        count: row._count._all,
      })),
    }
  },

  // ── 6. Medicamentos ──────────────────────────────────────────────────────
  async getMedications(query: MedicationsReportQuery) {
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const filters = {
      ...(query.search && { search: query.search }),
      ...(query.stripeColor && { stripeColor: query.stripeColor }),
      ...(query.continuousUse !== undefined && { continuousUse: query.continuousUse }),
      ...(query.state && { state: query.state }),
      ...(query.city && { city: query.city }),
      ...(query.clinicIds && { clinicIds: query.clinicIds }),
      ...(query.doctorIds && { doctorIds: query.doctorIds }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }

    const [
      total,
      groups,
      ranking,
      tarja,
      doseAdherence,
      totalMedications,
      continuousUseCount,
      createdThisMonth,
      createdPreviousMonth,
      avgPerUser,
      avgPerUserPreviousMonth,
    ] = await Promise.all([
      reportsRepository.countMedicationsGrouped(filters),
      reportsRepository.medicationsGrouped(filters, pagination),
      reportsRepository.medicationsRanking(),
      reportsRepository.tarjaDistribution(),
      reportsRepository.doseAdherenceDistribution(),
      reportsRepository.countMedications(),
      reportsRepository.countMedicationsContinuousUse(),
      reportsRepository.countMedicationsCreatedInRange(currentMonthStart, now),
      reportsRepository.countMedicationsCreatedInRange(previousMonthStart, currentMonthStart),
      reportsRepository.averageMedicationsPerUser(),
      reportsRepository.averageMedicationsPerUserAsOf(currentMonthStart),
    ])

    const onTime = doseAdherence.find((row) => row.state === 'TAKEN')?._count._all ?? 0
    const late = doseAdherence.find((row) => row.state === 'LATE')?._count._all ?? 0

    return {
      kpis: {
        totalMedications,
        continuousUseCount,
        createdThisMonth,
        avgPerUser: Math.round(avgPerUser * 10) / 10,
        createdThisMonthDeltaPercent: percentDelta(createdThisMonth, createdPreviousMonth),
        avgPerUserDeltaPercent: percentDelta(avgPerUser, avgPerUserPreviousMonth),
      },
      topMedications: ranking.map((row) => ({
        name: row.name,
        dosage: row.dosage,
        dosageUnit: row.dosageUnit,
        count: Number(row.count),
      })),
      tarjaDistribution: tarja.map((row) => ({
        stripeColor: row.stripeColor,
        count: row._count._all,
      })),
      doseAdherence: { onTime, late },
      items: {
        items: groups.map((group) => ({
          name: group.name,
          dosage: group.dosage,
          dosageUnit: group.dosageUnit,
          form: group.form,
          stripeColor: group.stripeColor,
          totalCount: Number(group.totalCount),
          continuousUsePercent: group.continuousUsePercent,
          onTimePercent:
            Number(group.takenOrLate) > 0
              ? Math.round((Number(group.taken) / Number(group.takenOrLate)) * 1000) / 10
              : null,
        })),
        total,
      },
    }
  },

  async getMedicationCities(state: string) {
    return reportsRepository.distinctCitiesByState(state)
  },

  // ── 7. Churn ──────────────────────────────────────────────────────────────
  async getChurn(query: ChurnReportQuery) {
    const now = new Date()
    const thresholdDate = new Date(now.getTime() - query.thresholdDays * DAY_MS)
    const filters = {
      thresholdDate,
      ...(query.search && { search: query.search }),
      ...(query.status && { status: query.status }),
      ...(query.planId && { planId: query.planId }),
    }

    const [{ doctors, clinics, users }, totalDoctors, totalClinics, totalUsers, evolutionRows] =
      await Promise.all([
        loadAtRiskRows(filters),
        doctorsRepository.count({}),
        clinicsRepository.count({}),
        usersRepository.count({}),
        reportsRepository.riskEvolutionByMonth(query.evolutionMonths, query.thresholdDays),
      ])

    const doctorsAtRisk = doctors.length
    const clinicsAtRisk = clinics.length
    const usersAtRisk = users.length
    const allRows = [...doctors, ...clinics, ...users]
    const totalAtRisk = allRows.length

    const tabRows =
      query.tab === 'doctors'
        ? doctors
        : query.tab === 'clinics'
          ? clinics
          : query.tab === 'users'
            ? users
            : allRows
    const sorted = sortChurnRows(tabRows, query.sortBy, query.sortDir, now)
    const { items, total } = paginate(sorted, query.page, query.pageSize)

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

    return {
      kpis: {
        totalAtRisk,
        clinicsAtRisk,
        clinicsTotal: totalClinics,
        clinicsAtRiskPercent: pct(clinicsAtRisk, totalClinics),
        doctorsAtRisk,
        doctorsTotal: totalDoctors,
        doctorsAtRiskPercent: pct(doctorsAtRisk, totalDoctors),
        usersAtRisk,
        usersTotal: totalUsers,
        usersAtRiskPercent: pct(usersAtRisk, totalUsers),
        thresholdDays: query.thresholdDays,
      },
      evolutionAvailable: true as const,
      evolution: evolutionRows.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        clinicsAtRisk: row.clinicsAtRisk,
        doctorsAtRisk: row.doctorsAtRisk,
        usersAtRisk: row.usersAtRisk,
      })),
      distribution: [
        { segment: 'users' as const, count: usersAtRisk },
        { segment: 'doctors' as const, count: doctorsAtRisk },
        { segment: 'clinics' as const, count: clinicsAtRisk },
      ],
      tabCounts: {
        all: totalAtRisk,
        doctors: doctorsAtRisk,
        clinics: clinicsAtRisk,
        users: usersAtRisk,
      },
      rows: {
        items: items.map((row) => ({
          id: row.id,
          type: row.type,
          name: row.name,
          planName: row.planName,
          createdAt: row.createdAt,
          lastLoginAt: row.lastLoginAt,
          inactiveDays: Math.floor(
            (now.getTime() - (row.lastLoginAt ?? row.createdAt).getTime()) / DAY_MS,
          ),
        })),
        total,
      },
    }
  },
}
