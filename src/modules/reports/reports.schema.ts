import { z } from 'zod'

const paginationShape = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}

export const ListReportPageQuerySchema = z.object(paginationShape)

export const MedicationsReportQuerySchema = z.object({
  search: z.string().min(1).optional(),
  stripeColor: z.enum(['NONE', 'BLACK', 'RED', 'ORANGE']).optional(),
  continuousUse: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  state: z.string().length(2).optional(),
  ...paginationShape,
})

export const ChurnReportQuerySchema = z.object({
  thresholdDays: z.coerce.number().int().positive().default(30),
  tab: z.enum(['doctors', 'clinics', 'users']).default('doctors'),
  ...paginationShape,
})

export type ListReportPageQuery = z.infer<typeof ListReportPageQuerySchema>
export type MedicationsReportQuery = z.infer<typeof MedicationsReportQuerySchema>
export type ChurnReportQuery = z.infer<typeof ChurnReportQuerySchema>
