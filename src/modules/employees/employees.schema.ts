import { z } from 'zod'

const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])

export const CreateEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(8).optional(),
  profileLabel: z.string().min(1).optional(),
})

export const UpdateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  profileLabel: z.string().min(1).optional(),
  status: StatusEnum.optional(),
})

export const ListEmployeesQuerySchema = z.object({
  status: StatusEnum.optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>
export type ListEmployeesQuery = z.infer<typeof ListEmployeesQuerySchema>
