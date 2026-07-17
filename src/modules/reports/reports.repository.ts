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
  payableSumByCategory() {
    return db.accountPayable.groupBy({
      by: ['category'],
      where: { status: { in: ['PENDING', 'OVERDUE'] } },
      _sum: { valueCents: true },
      _count: { _all: true },
    })
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
