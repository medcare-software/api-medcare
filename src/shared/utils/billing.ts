import type { BillingCycle } from '@prisma/client'

export const MONTHS_BY_BILLING_CYCLE: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
}

// Primeiro vencimento de uma assinatura nova — hoje + duração de um ciclo do plano escolhido.
export function computeNextDueDate(billingCycle: BillingCycle): Date {
  const nextDueDate = new Date()
  nextDueDate.setMonth(nextDueDate.getMonth() + MONTHS_BY_BILLING_CYCLE[billingCycle])
  return nextDueDate
}
