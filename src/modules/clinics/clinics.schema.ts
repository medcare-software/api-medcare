import { z } from 'zod'

const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().min(1).optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().min(8),
})

export const CreateClinicSchema = z.object({
  legalName: z.string().min(1),
  tradeName: z.string().min(1),
  cnpj: z.string().min(14),
  email: z.string().email(),
  phone: z.string().min(8),
  address: AddressSchema,
  planId: z.string().min(1).optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  adminPhone: z.string().min(8).optional(),
})

export const UpdateClinicSchema = z.object({
  legalName: z.string().min(1).optional(),
  tradeName: z.string().min(1).optional(),
  cnpj: z.string().min(14).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  address: AddressSchema.optional(),
  planId: z.string().min(1).nullable().optional(),
  status: StatusEnum.optional(),
})

export const UpdateClinicSelfSchema = z.object({
  tradeName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  address: AddressSchema.optional(),
})

export const ListClinicsQuerySchema = z.object({
  status: StatusEnum.optional(),
  search: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export const ListClinicDoctorsQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
})

export const LinkDoctorSchema = z.object({
  doctorId: z.string().min(1),
})

export const ToggleLinkSchema = z.object({
  active: z.boolean(),
})

export type CreateClinicInput = z.infer<typeof CreateClinicSchema>
export type UpdateClinicInput = z.infer<typeof UpdateClinicSchema>
export type UpdateClinicSelfInput = z.infer<typeof UpdateClinicSelfSchema>
export type ListClinicsQuery = z.infer<typeof ListClinicsQuerySchema>
export type ListClinicDoctorsQuery = z.infer<typeof ListClinicDoctorsQuerySchema>
export type LinkDoctorInput = z.infer<typeof LinkDoctorSchema>
export type ToggleLinkInput = z.infer<typeof ToggleLinkSchema>
