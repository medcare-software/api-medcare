import type { Prisma } from '@prisma/client'

import { resolveClinicId, resolveDoctorId } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
import { plansRepository } from './plans.repository.js'
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  ListPlansQuery,
  ListSubscriptionsQuery,
  UpdatePlanInput,
  UpdateSubscriptionInput,
} from './plans.schema.js'

export const plansService = {
  async list(user: AuthUser, query: ListPlansQuery) {
    const includeInactive = user.role === 'PLATFORM_ADMIN' && query.includeInactive === true
    const plans = await plansRepository.findMany({
      ...(query.type && { type: query.type }),
      includeInactive,
    })
    const activeSubscriptionCounts = await Promise.all(
      plans.map((plan) => plansRepository.countActiveSubscriptions(plan.id)),
    )
    return plans.map((plan, index) => ({
      ...plan,
      activeSubscriptionsCount: activeSubscriptionCounts[index],
    }))
  },

  async getById(user: AuthUser, id: string) {
    const plan = await plansRepository.findById(id)
    if (!plan) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Plano não encontrado' })
    }
    if (plan.status !== 'ACTIVE' && user.role !== 'PLATFORM_ADMIN') {
      throw new AppError({ code: 'NOT_FOUND', message: 'Plano não encontrado' })
    }
    return plan
  },

  async create(input: CreatePlanInput) {
    return plansRepository.create(
      omitUndefined({
        name: input.name,
        type: input.type,
        basePrice: input.basePrice,
        billingCycle: input.billingCycle,
        includedDoctors: input.includedDoctors,
        devicesPerDoctor: input.devicesPerDoctor,
        extraMemberFee: input.extraMemberFee,
      }),
    )
  },

  async update(id: string, input: UpdatePlanInput) {
    const plan = await plansRepository.findById(id)
    if (!plan) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Plano não encontrado' })
    }
    return plansRepository.update(id, omitUndefined(input))
  },

  async deactivate(id: string) {
    const plan = await plansRepository.findById(id)
    if (!plan) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Plano não encontrado' })
    }
    const activeCount = await plansRepository.countActiveSubscriptions(id)
    if (activeCount > 0) {
      throw new AppError({ code: 'CONFLICT', message: 'Plano possui assinaturas ativas' })
    }
    await plansRepository.deactivate(id)
  },

  async listSubscriptions(user: AuthUser, query: ListSubscriptionsQuery) {
    const filters = { ...(query.status && { status: query.status }) }

    if (user.role === 'PLATFORM_ADMIN') {
      return plansRepository.findAllSubscriptions({
        ...filters,
        ...(query.doctorId && { doctorId: query.doctorId }),
        ...(query.clinicId && { clinicId: query.clinicId }),
      })
    }

    if (user.role === 'DOCTOR') {
      const doctorId = await resolveDoctorId(user.id)
      return plansRepository.findSubscriptionsByDoctor(doctorId, filters)
    }

    if (user.role === 'CLINIC_ADMIN') {
      const clinicId = await resolveClinicId(user.id)
      return plansRepository.findSubscriptionsByClinic(clinicId, filters)
    }

    throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não tem acesso a assinaturas' })
  },

  async createSubscription(user: AuthUser, input: CreateSubscriptionInput) {
    let doctorId: string | undefined
    let clinicId: string | undefined

    if (user.role === 'DOCTOR') {
      doctorId = await resolveDoctorId(user.id)
    } else if (user.role === 'CLINIC_ADMIN') {
      clinicId = await resolveClinicId(user.id)
    } else if (user.role === 'PLATFORM_ADMIN') {
      doctorId = input.doctorId
      clinicId = input.clinicId
    } else {
      throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode assinar um plano' })
    }

    const plan = await plansRepository.findById(input.planId)
    if (!plan || plan.status !== 'ACTIVE') {
      throw new AppError({ code: 'NOT_FOUND', message: 'Plano não encontrado ou inativo' })
    }

    const existing = await plansRepository.findActiveOrLateSubscription(
      omitUndefined({ doctorId, clinicId }),
    )
    if (existing) {
      throw new AppError({ code: 'CONFLICT', message: 'Já existe uma assinatura ativa' })
    }

    return plansRepository.createSubscription({
      planId: input.planId,
      ...(doctorId !== undefined && { doctorId }),
      ...(clinicId !== undefined && { clinicId }),
      paymentMethod: input.paymentMethod,
      nextDueDate: input.nextDueDate,
      ...(input.billingAddress !== undefined && {
        billingAddress: input.billingAddress as Prisma.InputJsonValue,
      }),
    })
  },

  async updateSubscription(id: string, input: UpdateSubscriptionInput) {
    const subscription = await plansRepository.findSubscriptionById(id)
    if (!subscription) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Assinatura não encontrada' })
    }
    return plansRepository.updateSubscription(id, omitUndefined(input))
  },

  async cancelSubscription(user: AuthUser, id: string) {
    const subscription = await plansRepository.findSubscriptionById(id)
    if (!subscription) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Assinatura não encontrada' })
    }

    if (user.role === 'PLATFORM_ADMIN') {
      return plansRepository.cancelSubscription(id)
    }

    if (user.role === 'DOCTOR') {
      const doctorId = await resolveDoctorId(user.id)
      if (subscription.doctorId !== doctorId) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Assinatura não encontrada' })
      }
      return plansRepository.cancelSubscription(id)
    }

    if (user.role === 'CLINIC_ADMIN') {
      const clinicId = await resolveClinicId(user.id)
      if (subscription.clinicId !== clinicId) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Assinatura não encontrada' })
      }
      return plansRepository.cancelSubscription(id)
    }

    throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode cancelar esta assinatura' })
  },
}
