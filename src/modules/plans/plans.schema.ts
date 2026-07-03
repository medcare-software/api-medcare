import { z } from 'zod'

const PlanTypeEnum = z.enum(['CLINIC', 'DOCTOR'])
const BillingCycleEnum = z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'])
const PaymentMethodEnum = z.enum(['PIX', 'BOLETO', 'CREDIT_CARD', 'TRANSFER'])
const SubscriptionStatusEnum = z.enum(['ACTIVE', 'LATE', 'CANCELLED'])
const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])

export const CreatePlanSchema = z.object({
  name: z.string().min(1),
  type: PlanTypeEnum,
  basePrice: z.coerce.number().positive(),
  billingCycle: BillingCycleEnum.default('MONTHLY'),
})

export const UpdatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  type: PlanTypeEnum.optional(),
  basePrice: z.coerce.number().positive().optional(),
  billingCycle: BillingCycleEnum.optional(),
  status: StatusEnum.optional(),
})

export const ListPlansQuerySchema = z.object({
  type: PlanTypeEnum.optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
})

export const CreateSubscriptionSchema = z
  .object({
    planId: z.string().min(1),
    doctorId: z.string().min(1).optional(),
    clinicId: z.string().min(1).optional(),
    paymentMethod: PaymentMethodEnum,
    nextDueDate: z.coerce.date(),
  })
  .refine((data) => Boolean(data.doctorId) !== Boolean(data.clinicId), {
    message: 'Informe exatamente um de doctorId ou clinicId',
    path: ['doctorId'],
  })

export const UpdateSubscriptionSchema = z.object({
  nextDueDate: z.coerce.date().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  status: SubscriptionStatusEnum.optional(),
})

export const ListSubscriptionsQuerySchema = z.object({
  doctorId: z.string().min(1).optional(),
  clinicId: z.string().min(1).optional(),
  status: SubscriptionStatusEnum.optional(),
})

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>
export type ListPlansQuery = z.infer<typeof ListPlansQuerySchema>
export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>
export type UpdateSubscriptionInput = z.infer<typeof UpdateSubscriptionSchema>
export type ListSubscriptionsQuery = z.infer<typeof ListSubscriptionsQuerySchema>
