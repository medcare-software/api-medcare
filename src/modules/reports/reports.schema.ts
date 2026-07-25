import { z } from 'zod'

const paginationShape = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}

const dateRangeShape = {
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
}

export const ListReportPageQuerySchema = z.object({
  ...paginationShape,
  ...dateRangeShape,
})

const csvToArray = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').filter(Boolean) : undefined))

export const MedicationsReportQuerySchema = z.object({
  search: z.string().min(1).optional(),
  stripeColor: z.enum(['NONE', 'BLACK', 'RED', 'ORANGE']).optional(),
  continuousUse: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  state: z.string().length(2).optional(),
  city: z.string().min(1).optional(),
  clinicIds: csvToArray,
  doctorIds: csvToArray,
  ...paginationShape,
  ...dateRangeShape,
})

export const MedicationCitiesQuerySchema = z.object({
  state: z.string().length(2),
})

export const ChurnReportQuerySchema = z.object({
  tab: z.enum(['all', 'doctors', 'clinics', 'users']).default('all'),
  search: z.string().min(1).optional(),
  thresholdDays: z.coerce.number().int().positive().default(30),
  status: z.enum(['ACTIVE', 'LATE', 'CANCELLED']).optional(),
  planId: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'lastLoginAt', 'inactiveDays']).default('inactiveDays'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  evolutionMonths: z.coerce.number().int().positive().max(24).default(6),
  ...paginationShape,
  ...dateRangeShape,
})

export const GrowthReportQuerySchema = z.object({
  state: z.string().length(2).optional(),
})

export type ListReportPageQuery = z.infer<typeof ListReportPageQuerySchema>
export type MedicationsReportQuery = z.infer<typeof MedicationsReportQuerySchema>
export type MedicationCitiesQuery = z.infer<typeof MedicationCitiesQuerySchema>
export type ChurnReportQuery = z.infer<typeof ChurnReportQuerySchema>
export type GrowthReportQuery = z.infer<typeof GrowthReportQuerySchema>
