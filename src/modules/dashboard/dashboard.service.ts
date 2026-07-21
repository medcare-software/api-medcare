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

export const dashboardService = {
  async getOverview(query: DashboardQuery) {
    const monthStart = startOfMonth()

    const [
      clinicsByStatus,
      doctorsByStatus,
      usersByRole,
      monthlyRevenue,
      monthlySignups,
      platformBreakdown,
      storeDownloads,
      totalDownloadsAgg,
      downloadsThisMonthAgg,
      clinicsCreatedThisMonth,
      doctorsCreatedThisMonth,
      topSpecialty,
      topState,
      previousMonthRevenue,
      monthlyDownloads,
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
    ])

    const activeClinics = countByStatus(clinicsByStatus, 'ACTIVE')
    const inactiveClinics = countByStatus(clinicsByStatus, 'INACTIVE')
    const activeDoctors = countByStatus(doctorsByStatus, 'ACTIVE')
    const inactiveDoctors = countByStatus(doctorsByStatus, 'INACTIVE')
    const totalAppUsers = sumAll(usersByRole)
    const totalDownloads = totalDownloadsAgg._sum.downloadCount ?? 0
    const downloadsThisMonth = downloadsThisMonthAgg._sum.downloadCount ?? 0

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
      monthlySignups: monthlySignups.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        count: Number(row.count),
      })),
      monthlyDownloads: monthlyDownloads.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        count: Number(row.count),
      })),
      clientTypeBreakdown: [
        { id: 'clinics', label: 'Clínicas', count: activeClinics },
        { id: 'doctors', label: 'Médicos', count: activeDoctors },
        { id: 'appUsers', label: 'Usuários app', count: totalAppUsers },
      ],
      platformBreakdown: platformBreakdown.map((row) => ({
        platform: row.platform,
        count: row._count._all,
      })),
      storeDownloads,
    }
  },
}
