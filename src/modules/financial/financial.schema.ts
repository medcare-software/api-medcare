import { z } from 'zod'

const SupplierCategoryEnum = z.enum([
  'INFRASTRUCTURE',
  'SERVICES',
  'MARKETING',
  'TAX',
  'EQUIPMENT',
  'SOFTWARE',
  'RENT',
  'UTILITIES',
])
const PaymentMethodEnum = z.enum(['PIX', 'BOLETO'])
const AccountPayableTypeEnum = z.enum(['ONE_TIME', 'RECURRING'])
const AccountPayableStatusEnum = z.enum(['PAID', 'PENDING', 'OVERDUE', 'PAID_LATE', 'CANCELLED'])
const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

// Extrai ano/mês da string "YYYY-MM-DD" e reconstrói como meia-noite no fuso
// local do servidor — igual a `new Date(y, m, 1)` usado em
// financial.repository.ts#currentReferenceMonth() e em
// payments.service.ts#ensurePaymentsGenerated(). Não usar z.coerce.date()
// direto aqui: isso interpretaria a string como UTC e, num servidor fora de
// UTC, o valor resultante não bateria com o `referenceMonth` gravado no banco
// (comparação é por igualdade exata, não por range).
export const ReferenceMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/)
  .transform((value) => {
    const parts = value.split('-')
    const year = Number(parts[0])
    const month = Number(parts[1])
    return new Date(year, month - 1, 1)
  })

// Só metadados de exibição (frequência/término) — não dispara geração automática
// de próximas ocorrências, cobrança aqui é sempre manual.
const RecurrenceConfigSchema = z.object({
  startDateIso: z.string().min(1),
  frequency: z.enum(['dia', 'semana', 'mes', 'ano']),
  endType: z.enum(['never', 'after_occurrences', 'on_date']),
  occurrencesCount: z.number().int().positive().optional(),
  endDateIso: z.string().optional(),
  // Só relevante quando frequency === 'mes' — refina a recorrência mensal
  // entre "todo dia X do mês" (fixed_day) e "toda Nª semana do mês" (nth_weekday).
  monthlyMode: z.enum(['fixed_day', 'nth_weekday']).optional(),
  weekOfMonth: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
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
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export const CreateAccountPayableSchema = z
  .object({
    supplierId: z.string().min(1),
    description: z.string().min(1),
    category: SupplierCategoryEnum,
    valueCents: z.number().int().positive(),
    dueDate: z.coerce.date(),
    paymentMethod: PaymentMethodEnum,
    type: AccountPayableTypeEnum.default('ONE_TIME'),
    recurrence: RecurrenceConfigSchema.optional(),
  })
  .refine((data) => data.dueDate >= startOfToday(), {
    message: 'Vencimento não pode estar no passado',
    path: ['dueDate'],
  })

// Sem refine de "vencimento no passado" aqui de propósito: reeditar uma conta
// já OVERDUE reenvia o dueDate original (que é passado por definição) mesmo
// sem o admin mexer nesse campo — bloquear isso impediria editar qualquer
// outro dado de uma conta vencida. A regra é só pra cadastro (ver CreateAccountPayableSchema).
export const UpdateAccountPayableSchema = z.object({
  description: z.string().min(1).optional(),
  category: SupplierCategoryEnum.optional(),
  valueCents: z.number().int().positive().optional(),
  dueDate: z.coerce.date().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  type: AccountPayableTypeEnum.optional(),
  recurrence: RecurrenceConfigSchema.optional(),
  receiptFileId: z.string().min(1).optional(),
  notes: z.string().optional(),
})

export const MarkPaidSchema = z.object({
  receiptFileId: z.string().min(1).optional(),
  paidAt: z.coerce.date().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  valueCents: z.number().int().positive().optional(),
  notes: z.string().optional(),
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
  status: AccountPayableStatusEnum.optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  planId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  referenceMonth: ReferenceMonthSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

// Edição manual de uma cobrança já gerada (dueDate/forma/valor) — diferente de
// PayReceivableSchema, que marca como paga. Sem refine de "vencimento no
// passado": mesma razão de UpdateAccountPayableSchema.
export const UpdateReceivableSchema = z.object({
  dueDate: z.coerce.date().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  valueCents: z.number().int().positive().optional(),
})

export const PayReceivableSchema = z.object({
  paidAt: z.coerce.date().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  valueCents: z.number().int().positive().optional(),
})

export const CancelReceivableSchema = z.object({
  reason: z.string().min(1),
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
export type UpdateReceivableInput = z.infer<typeof UpdateReceivableSchema>
export type PayReceivableInput = z.infer<typeof PayReceivableSchema>
export type CancelReceivableInput = z.infer<typeof CancelReceivableSchema>
