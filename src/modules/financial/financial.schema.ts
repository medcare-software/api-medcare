import { z } from 'zod'

const SupplierCategoryEnum = z.enum(['INFRASTRUCTURE', 'SERVICES', 'MARKETING', 'TAX'])
const PaymentMethodEnum = z.enum(['PIX', 'BOLETO', 'CREDIT_CARD', 'TRANSFER'])
const AccountPayableTypeEnum = z.enum(['ONE_TIME', 'RECURRING'])
const AccountPayableStatusEnum = z.enum(['PAID', 'PENDING', 'OVERDUE', 'PAID_LATE'])
const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])
const SubscriptionStatusEnum = z.enum(['ACTIVE', 'LATE', 'CANCELLED'])

// Só metadados de exibição (frequência/término) — não dispara geração automática
// de próximas ocorrências, cobrança aqui é sempre manual.
const RecurrenceConfigSchema = z.object({
  startDateIso: z.string().min(1),
  frequency: z.enum(['dia', 'semana', 'mes', 'ano']),
  endType: z.enum(['never', 'after_occurrences', 'on_date']),
  occurrencesCount: z.number().int().positive().optional(),
  endDateIso: z.string().optional(),
})

export const CreateSupplierSchema = z.object({
  name: z.string().min(1),
  document: z.string().min(11),
  email: z.string().email(),
  phone: z.string().min(8),
  category: SupplierCategoryEnum,
})

export const UpdateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  document: z.string().min(11).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  category: SupplierCategoryEnum.optional(),
  status: StatusEnum.optional(),
})

export const ListSuppliersQuerySchema = z.object({
  status: StatusEnum.optional(),
  category: SupplierCategoryEnum.optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export const CreateAccountPayableSchema = z.object({
  supplierId: z.string().min(1),
  description: z.string().min(1),
  category: SupplierCategoryEnum,
  valueCents: z.number().int().positive(),
  dueDate: z.coerce.date(),
  paymentMethod: PaymentMethodEnum,
  type: AccountPayableTypeEnum.default('ONE_TIME'),
  recurrence: RecurrenceConfigSchema.optional(),
})

export const UpdateAccountPayableSchema = z.object({
  description: z.string().min(1).optional(),
  category: SupplierCategoryEnum.optional(),
  valueCents: z.number().int().positive().optional(),
  dueDate: z.coerce.date().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  type: AccountPayableTypeEnum.optional(),
  recurrence: RecurrenceConfigSchema.optional(),
  receiptFileId: z.string().min(1).optional(),
})

export const MarkPaidSchema = z.object({
  receiptFileId: z.string().min(1).optional(),
})

export const ListAccountsPayableQuerySchema = z.object({
  supplierId: z.string().min(1).optional(),
  status: AccountPayableStatusEnum.optional(),
  category: SupplierCategoryEnum.optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export const ListReceivablesQuerySchema = z.object({
  status: SubscriptionStatusEnum.optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  planId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>
export type ListSuppliersQuery = z.infer<typeof ListSuppliersQuerySchema>
export type CreateAccountPayableInput = z.infer<typeof CreateAccountPayableSchema>
export type UpdateAccountPayableInput = z.infer<typeof UpdateAccountPayableSchema>
export type MarkPaidInput = z.infer<typeof MarkPaidSchema>
export type ListAccountsPayableQuery = z.infer<typeof ListAccountsPayableQuerySchema>
export type RecurrenceConfigInput = z.infer<typeof RecurrenceConfigSchema>
export type ListReceivablesQuery = z.infer<typeof ListReceivablesQuerySchema>
