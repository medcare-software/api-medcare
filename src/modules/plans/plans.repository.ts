import type {
  BillingCycle,
  PaymentMethod,
  PlanType,
  Prisma,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

type PlanListFilters = {
  type?: PlanType
  includeInactive?: boolean
}

type CreatePlanData = {
  name: string
  type: PlanType
  basePrice: number
  billingCycle: BillingCycle
  includedDoctors?: number
  devicesPerDoctor?: number
  extraMemberFee?: number
}

type PlanUpdateData = {
  name?: string
  type?: PlanType
  basePrice?: number
  billingCycle?: BillingCycle
  includedDoctors?: number | null
  devicesPerDoctor?: number | null
  extraMemberFee?: number | null
  status?: UserStatus
}

type SubscriptionListFilters = {
  doctorId?: string
  clinicId?: string
  status?: SubscriptionStatus
}

type CreateSubscriptionData = {
  planId: string
  doctorId?: string
  clinicId?: string
  paymentMethod: PaymentMethod
  nextDueDate: Date
  billingAddress?: Prisma.InputJsonValue
}

type UpdateSubscriptionData = {
  nextDueDate?: Date
  paymentMethod?: PaymentMethod
  status?: SubscriptionStatus
}

export const plansRepository = {
  findMany(filters: PlanListFilters) {
    return db.plan.findMany({
      where: {
        ...(filters.type && { type: filters.type }),
        ...(!filters.includeInactive && { status: 'ACTIVE' }),
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  findById(id: string) {
    return db.plan.findUnique({ where: { id } })
  },

  create(data: CreatePlanData) {
    return db.plan.create({ data: { ...data, status: 'ACTIVE' } })
  },

  update(id: string, data: PlanUpdateData) {
    return db.plan.update({ where: { id }, data: omitUndefined(data) })
  },

  deactivate(id: string) {
    return db.plan.update({ where: { id }, data: { status: 'INACTIVE' } })
  },

  countActiveSubscriptions(planId: string) {
    return db.subscription.count({ where: { planId, status: 'ACTIVE' } })
  },

  findSubscriptionsByDoctor(doctorId: string, filters: { status?: SubscriptionStatus }) {
    return db.subscription.findMany({
      where: { doctorId, ...(filters.status && { status: filters.status }) },
      orderBy: { createdAt: 'desc' },
    })
  },

  findSubscriptionsByClinic(clinicId: string, filters: { status?: SubscriptionStatus }) {
    return db.subscription.findMany({
      where: { clinicId, ...(filters.status && { status: filters.status }) },
      orderBy: { createdAt: 'desc' },
    })
  },

  findAllSubscriptions(filters: SubscriptionListFilters) {
    return db.subscription.findMany({
      where: {
        ...(filters.doctorId && { doctorId: filters.doctorId }),
        ...(filters.clinicId && { clinicId: filters.clinicId }),
        ...(filters.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  findSubscriptionById(id: string) {
    return db.subscription.findUnique({ where: { id } })
  },

  findActiveOrLateSubscription(params: { doctorId?: string; clinicId?: string }) {
    return db.subscription.findFirst({
      where: {
        ...(params.doctorId && { doctorId: params.doctorId }),
        ...(params.clinicId && { clinicId: params.clinicId }),
        status: { in: ['ACTIVE', 'LATE'] },
      },
    })
  },

  createSubscription(data: CreateSubscriptionData) {
    return db.subscription.create({ data: omitUndefined(data) })
  },

  updateSubscription(id: string, data: UpdateSubscriptionData) {
    return db.subscription.update({ where: { id }, data: omitUndefined(data) })
  },

  cancelSubscription(id: string) {
    return db.subscription.update({ where: { id }, data: { status: 'CANCELLED' } })
  },
}
