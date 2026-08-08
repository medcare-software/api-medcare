import { reportsRepository } from '../reports/reports.repository.js'
import { storeAnalyticsService } from '../store-analytics/store-analytics.service.js'
import { dashboardRepository } from './dashboard.repository.js'
import type { DashboardQuery } from './dashboard.schema.js'

function countByStatus(rows: { status: string; _count: { _all: number } }[], status: string) {
  return rows.find((row) => row.status === status)?._count._all ?? 0
}

function sumAll(rows: { _count: { _all: number } }[]) {
  return rows.reduce((total, row) => total + row._count._all, 0)
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthKeyUtc(date: Date) {
  return date.toISOString().slice(0, 7)
}

/** Preenche meses vazios a partir da série de cadastros (fallback do chart). */
function monthlyPlatformFromSignups(
  signups: { month: string; count: number }[],
  months: number,
) {
  const byMonth = new Map(signups.map((row) => [row.month, row.count]))
  const result: { month: string; ios: number; android: number; total: number }[] = []
  const cursor = new Date()
  cursor.setUTCDate(1)
  cursor.setUTCHours(0, 0, 0, 0)
  cursor.setUTCMonth(cursor.getUTCMonth() - (months - 1))

  for (let i = 0; i < months; i += 1) {
    const month = monthKeyUtc(cursor)
    const total = byMonth.get(month) ?? 0
    result.push({ month, ios: 0, android: 0, total })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return result
}

export const dashboardService = {
  async getOverview(query: DashboardQuery) {
    const monthStart = startOfMonth()

    const [
      clinicsByStatus,
      doctorsByStatus,
      usersByRole,
      monthlyRevenue,
      monthlySignupsRaw,
      platformBreakdown,
      storeDownloads,
      totalDownloadsAgg,
      downloadsThisMonthAgg,
      clinicsCreatedThisMonth,
      doctorsCreatedThisMonth,
      topSpecialty,
      topState,
      previousMonthRevenue,
      monthlyDownloadsRaw,
      monthlyDownloadsByPlatformRaw,
      stateBreakdown,
    ] = await Promise.all([
      dashboardRepository.countClinicsByStatus(),
      dashboardRepository.countDoctorsByStatus(),
      dashboardRepository.countUsersByRole(),
      dashboardRepository.sumActiveSubscriptionRevenue(),
      dashboardRepository.monthlySignupSeries(query.months),
      dashboardRepository.countByPlatform(),
      storeAnalyticsService.getAggregatedDownloads({ days: 30 }),
      dashboardRepository.sumAllDownloads(),
      dashboardRepository.sumDownloadsInRange(monthStart, new Date()),
      dashboardRepository.countCreatedSince('clinic', monthStart),
      dashboardRepository.countCreatedSince('doctor', monthStart),
      dashboardRepository.topSpecialty(),
      dashboardRepository.topClinicState(),
      dashboardRepository.sumSubscriptionRevenueAt(['ACTIVE'], monthStart),
      dashboardRepository.monthlyDownloadSeries(query.months),
      storeAnalyticsService.getMonthlyDownloadsByPlatform(query.months),
      reportsRepository.countUsersByState(),
    ])

    const activeClinics = countByStatus(clinicsByStatus, 'ACTIVE')
    const inactiveClinics = countByStatus(clinicsByStatus, 'INACTIVE')
    const activeDoctors = countByStatus(doctorsByStatus, 'ACTIVE')
    const inactiveDoctors = countByStatus(doctorsByStatus, 'INACTIVE')
    const totalAppUsers = sumAll(usersByRole)

    const monthlySignups = monthlySignupsRaw.map((row) => ({
      month: monthKeyUtc(row.month),
      count: Number(row.count),
    }))
    const monthlyDownloads = monthlyDownloadsRaw.map((row) => ({
      month: monthKeyUtc(row.month),
      count: Number(row.count),
    }))

    const storeHasData = monthlyDownloadsByPlatformRaw.some((row) => row.total > 0)
    const storesConfigured =
      storeDownloads.configured.ios || storeDownloads.configured.android
    // Sem snapshots das lojas, o chart/KPIs de download usam cadastros como proxy
    // (mesmo critério do relatório de crescimento) para não ficar "morto".
    const downloadsChartSource = storeHasData ? ('stores' as const) : ('signups' as const)
    const monthlyDownloadsByPlatform = storeHasData
      ? monthlyDownloadsByPlatformRaw
      : monthlyPlatformFromSignups(monthlySignups, query.months)

    const signupTotal = monthlySignups.reduce((sum, row) => sum + row.count, 0)
    const signupThisMonth = monthlySignups.at(-1)?.count ?? 0
    const totalDownloads = storeHasData
      ? (totalDownloadsAgg._sum.downloadCount ?? 0)
      : signupTotal
    const downloadsThisMonth = storeHasData
      ? (downloadsThisMonthAgg._sum.downloadCount ?? 0)
      : signupThisMonth

    let mrrChangePercent = 0
    if (previousMonthRevenue > 0) {
      mrrChangePercent = ((monthlyRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
    } else if (monthlyRevenue > 0) {
      mrrChangePercent = 100
    }

    return {
      kpis: {
        registeredClinics: activeClinics + inactiveClinics,
        activeClinics,
        inactiveClinics,
        registeredDoctors: activeDoctors + inactiveDoctors,
        activeDoctors,
        inactiveDoctors,
        topSpecialty,
        topState,
        monthlyRevenue,
        totalAppUsers,
        totalDownloads,
        downloadsThisMonth,
        clinicsCreatedThisMonth,
        doctorsCreatedThisMonth,
        mrrChangePercent: Math.round(mrrChangePercent * 10) / 10,
      },
      monthlySignups,
      monthlyDownloads,
      monthlyDownloadsByPlatform,
      downloadsChartSource,
      storesConfigured,
      clientTypeBreakdown: [
        { id: 'clinics', label: 'Clínicas', count: activeClinics },
        { id: 'doctors', label: 'Médicos', count: activeDoctors },
        { id: 'appUsers', label: 'Usuários app', count: totalAppUsers },
      ],
      platformBreakdown: platformBreakdown.map((row) => ({
        platform: row.platform,
        count: row._count._all,
      })),
      // Proxy geográfico: cadastros por UF (lojas não expõem downloads por estado BR).
      stateDistribution: stateBreakdown.map((row) => ({
        state: row.state ?? 'Não informado',
        count: row._count._all,
      })),
      storeDownloads,
    }
  },
}
