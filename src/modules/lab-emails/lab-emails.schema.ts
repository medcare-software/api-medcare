import { z } from 'zod'

const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])

export const CreateLabEmailSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const UpdateLabEmailSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  status: StatusEnum.optional(),
})

export const ListLabEmailsQuerySchema = z.object({
  status: StatusEnum.optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type CreateLabEmailInput = z.infer<typeof CreateLabEmailSchema>
export type UpdateLabEmailInput = z.infer<typeof UpdateLabEmailSchema>
export type ListLabEmailsQuery = z.infer<typeof ListLabEmailsQuerySchema>
