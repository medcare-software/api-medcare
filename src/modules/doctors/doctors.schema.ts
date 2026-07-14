import { z } from 'zod'

const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])

export const CreateDoctorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email({ message: 'E-mail inválido' }),
  // password removido — a senha temporária é gerada no servidor e enviada por e-mail
  phone: z.string().min(8).optional(),
  cpf: z.string().min(11),
  crmNumber: z.string().min(1),
  crmState: z.string().length(2),
  specialties: z.array(z.string().min(1)).min(1),
  planId: z.string().min(1).optional(),
})

export const UpdateDoctorSchema = z.object({
  name: z.string().min(1).optional(),
  crmNumber: z.string().min(1).optional(),
  crmState: z.string().length(2).optional(),
  specialties: z.array(z.string().min(1)).min(1).optional(),
  planId: z.string().min(1).nullable().optional(),
  phone: z.string().min(8).optional(),
  status: StatusEnum.optional(),
})

export const UpdateDoctorSelfSchema = z.object({
  phone: z.string().min(8).optional(),
  specialties: z.array(z.string().min(1)).min(1).optional(),
})

export const ListDoctorsQuerySchema = z.object({
  status: StatusEnum.optional(),
  specialty: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type CreateDoctorInput = z.infer<typeof CreateDoctorSchema>
export type UpdateDoctorInput = z.infer<typeof UpdateDoctorSchema>
export type UpdateDoctorSelfInput = z.infer<typeof UpdateDoctorSelfSchema>
export type ListDoctorsQuery = z.infer<typeof ListDoctorsQuerySchema>
