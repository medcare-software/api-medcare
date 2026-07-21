import { z } from 'zod'

export const ListClinicPaymentsQuerySchema = z.object({
  year: z.coerce.number().int().positive().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  status: z.enum(['PAID', 'PENDING', 'OVERDUE', 'PAID_LATE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(5),
})

export type ListClinicPaymentsQuery = z.infer<typeof ListClinicPaymentsQuerySchema>
