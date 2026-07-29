import { z } from 'zod'

export const AnvisaListTypeSchema = z.enum(['A', 'B'])
export const AnvisaMedicationStatusSchema = z.enum(['ACTIVE', 'EXCLUDED', 'INACTIVE'])
export const AnvisaImportOperationSchema = z.enum(['ADDITION', 'REMOVAL'])

export const ListAnvisaMedicationsQuerySchema = z.object({
  listType: AnvisaListTypeSchema,
  status: AnvisaMedicationStatusSchema.optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export const CatalogAnvisaMedicationsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  listType: AnvisaListTypeSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
})

export const ImportAnvisaFieldsSchema = z.object({
  listType: AnvisaListTypeSchema,
  operation: AnvisaImportOperationSchema,
})

export type ListAnvisaMedicationsQuery = z.infer<typeof ListAnvisaMedicationsQuerySchema>
export type CatalogAnvisaMedicationsQuery = z.infer<typeof CatalogAnvisaMedicationsQuerySchema>
export type ImportAnvisaFields = z.infer<typeof ImportAnvisaFieldsSchema>
