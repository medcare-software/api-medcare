import type { Subscription } from '@prisma/client'

import { resolveClinicId } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { MONTHS_BY_BILLING_CYCLE } from '../../shared/utils/index.js'
import { plansRepository } from '../plans/plans.repository.js'
import { paymentsRepository } from './payments.repository.js'
import type { ListClinicPaymentsQuery } from './payments.schema.js'

// Não há job agendado no projeto pra fechar cobranças mês a mês — os registros
// de Payment são gerados de forma preguiçosa (lazy) sempre que o histórico é
// consultado (pelo módulo payments) ou sempre que o Financeiro > Receber é
// calculado (pelo módulo financial, ver financial.service.ts), cobrindo todos
// os meses de referência entre a criação da assinatura e o mês atual.
export async function ensurePaymentsGenerated(subscription: Subscription) {
  const plan = await plansRepository.findById(subscription.planId)
  if (!plan) return

  const extraMemberFee = plan.extraMemberFee ? Number(plan.extraMemberFee) : 0
  const totalValue = Number(plan.basePrice) + subscription.extraDoctorsCount * extraMemberFee
  const amountCents = Math.round(totalValue * 100)

  const cycleMonths = MONTHS_BY_BILLING_CYCLE[plan.billingCycle]
  const billingDay = subscription.createdAt.getDate()
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const referenceMonths: Date[] = []
  let cursor = new Date(subscription.createdAt.getFullYear(), subscription.createdAt.getMonth(), 1)
  while (cursor <= currentMonthStart) {
    referenceMonths.push(cursor)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + cycleMonths, 1)
  }
  if (referenceMonths.length === 0) return

  // Status na geração depende só da data de vencimento, nunca de
  // Subscription.status (que na prática nunca é escrito em lugar nenhum do
  // código pra 'LATE') — um ciclo só vira PAID/PAID_LATE quando alguém
  // confirma o recebimento de verdade (ver financialService#payReceivable).
  const rows = referenceMonths.map((referenceMonth) => {
    const dueDate = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), billingDay)
    const status = dueDate > now ? 'PENDING' : 'OVERDUE'
    return {
      subscriptionId: subscription.id,
      referenceMonth,
      amountCents,
      dueDate,
      paidAt: null,
      paymentMethod: subscription.paymentMethod,
      status,
    } as const
  })

  await paymentsRepository.createManySkippingDuplicates(rows)
}

export const paymentsService = {
  async listForClinic(user: AuthUser, clinicId: string, query: ListClinicPaymentsQuery) {
    if (user.role === 'CLINIC_ADMIN') {
      const ownClinicId = await resolveClinicId(user.id)
      if (ownClinicId !== clinicId) {
        throw new AppError({ code: 'FORBIDDEN', message: 'Sem acesso ao histórico desta clínica' })
      }
    }

    const subscriptions = await plansRepository.findSubscriptionsByClinic(clinicId, {})
    if (subscriptions.length === 0) {
      return {
        items: [],
        total: 0,
        summary: { totalPaidCents: 0, totalPendingCents: 0, pendingCount: 0 },
      }
    }

    await Promise.all(subscriptions.map((subscription) => ensurePaymentsGenerated(subscription)))

    const subscriptionIds = subscriptions.map((subscription) => subscription.id)
    const filters = {
      ...(query.year && { year: query.year }),
      ...(query.month && { month: query.month }),
      ...(query.status && { status: query.status }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }

    const [items, total, summary] = await Promise.all([
      paymentsRepository.findMany(subscriptionIds, filters, pagination),
      paymentsRepository.count(subscriptionIds, filters),
      paymentsRepository.aggregate(subscriptionIds),
    ])

    return { items, total, summary }
  },

  // Usado pelo card "Status da assinatura" (aba Financeiro) pra exibir a data do
  // último pagamento confirmado, sem precisar abrir o histórico completo.
  async getLatestPaidDate(user: AuthUser, clinicId: string) {
    if (user.role === 'CLINIC_ADMIN') {
      const ownClinicId = await resolveClinicId(user.id)
      if (ownClinicId !== clinicId) {
        throw new AppError({ code: 'FORBIDDEN', message: 'Sem acesso ao histórico desta clínica' })
      }
    }

    const subscriptions = await plansRepository.findSubscriptionsByClinic(clinicId, {})
    if (subscriptions.length === 0) return null

    await Promise.all(subscriptions.map((subscription) => ensurePaymentsGenerated(subscription)))

    const subscriptionIds = subscriptions.map((subscription) => subscription.id)
    const latest = await paymentsRepository.findLatestPaid(subscriptionIds)
    return latest?.paidAt ?? null
  },
}
