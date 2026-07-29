import { z } from 'zod'

export const AnvisaListTypeSchema = z.enum(['A', 'B'])
export const AnvisaMedicationStatusSchema = z.enum(['ACTIVE', 'EXCLUDED', 'INACTIVE'])
export const AnvisaImportOperationSchema = z.enum(['ADDITION', 'REMOVAL'])

export const ListAnvisaMedicationsQuerySchema = z.object({
  listType: AnvisaListTypeSchema,
  /** EXCLUDED = aba Excluídos; omitido/current = aba Vigentes (ACTIVE+INACTIVE) */
  status: z.enum(['EXCLUDED']).optional(),
  /** Filtro de toggle na aba Vigentes */
  activation: z.enum(['all', 'ACTIVE', 'INACTIVE']).default('all'),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export const UpdateAnvisaMedicationStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
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
export type UpdateAnvisaMedicationStatusInput = z.infer<typeof UpdateAnvisaMedicationStatusSchema>
export type CatalogAnvisaMedicationsQuery = z.infer<typeof CatalogAnvisaMedicationsQuerySchema>
export type ImportAnvisaFields = z.infer<typeof ImportAnvisaFieldsSchema>
