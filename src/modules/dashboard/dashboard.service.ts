import { dashboardRepository } from './dashboard.repository.js'
import type { DashboardQuery } from './dashboard.schema.js'

function countByStatus(rows: { status: string; _count: { _all: number } }[], status: string) {
  return rows.find((row) => row.status === status)?._count._all ?? 0
}

function sumAll(rows: { _count: { _all: number } }[]) {
  return rows.reduce((total, row) => total + row._count._all, 0)
}

export const dashboardService = {
  async getOverview(query: DashboardQuery) {
    const [
      clinicsByStatus,
      doctorsByStatus,
      usersByRole,
      monthlyRevenue,
      monthlySignups,
      platformBreakdown,
    ] = await Promise.all([
      dashboardRepository.countClinicsByStatus(),
      dashboardRepository.countDoctorsByStatus(),
      dashboardRepository.countUsersByRole(),
      dashboardRepository.sumActiveSubscriptionRevenue(),
      dashboardRepository.monthlySignupSeries(query.months),
      dashboardRepository.countByPlatform(),
    ])

    const activeClinics = countByStatus(clinicsByStatus, 'ACTIVE')
    const inactiveClinics = countByStatus(clinicsByStatus, 'INACTIVE')
    const activeDoctors = countByStatus(doctorsByStatus, 'ACTIVE')
    const inactiveDoctors = countByStatus(doctorsByStatus, 'INACTIVE')
    const totalAppUsers = sumAll(usersByRole)

    return {
      kpis: {
        registeredClinics: activeClinics + inactiveClinics,
        activeClinics,
        inactiveClinics,
        registeredDoctors: activeDoctors + inactiveDoctors,
        activeDoctors,
        inactiveDoctors,
        monthlyRevenue,
        totalAppUsers,
      },
      monthlySignups: monthlySignups.map((row) => ({
        month: row.month.toISOString().slice(0, 7),
        count: Number(row.count),
      })),
      clientTypeBreakdown: [
        { id: 'clinics', label: 'Clínicas', count: activeClinics },
        { id: 'doctors', label: 'Médicos', count: activeDoctors },
        { id: 'appUsers', label: 'Usuários do app', count: totalAppUsers },
      ],
      platformBreakdown: platformBreakdown.map((row) => ({
        platform: row.platform,
        count: row._count._all,
      })),
    }
  },
}
