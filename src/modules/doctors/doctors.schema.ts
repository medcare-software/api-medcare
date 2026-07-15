import { z } from 'zod'

import { onlyDigits } from '../../shared/security/index.js'

const StatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING'])
const PaymentMethodEnum = z.enum(['PIX', 'BOLETO', 'CREDIT_CARD', 'TRANSFER'])

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().min(1).optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().min(8),
})

export const CreateDoctorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email({ message: 'E-mail inválido' }),
  // password removido — a senha temporária é gerada no servidor e enviada por e-mail
  phone: z.string().min(8).optional(),
  // Aceita com ou sem máscara — só o total de dígitos importa (ver frontend, que envia formatado).
  cpf: z.string().refine((value) => onlyDigits(value).length === 11, {
    message: 'CPF deve conter 11 dígitos',
  }),
  crmNumber: z.string().regex(/^\d{6}$/, 'CRM deve conter 6 dígitos'),
  crmState: z.string().length(2),
  // Opcional na UI de cadastro — o médico pode completar depois no próprio perfil.
  specialties: z.array(z.string().min(1)).default([]),
  planId: z.string().min(1).optional(),
  // Se informados junto com planId, criam a assinatura inicial do médico
  // (mesmo racional de CreateClinicSchema — ver clinicsService.create).
  paymentMethod: PaymentMethodEnum.optional(),
  billingAddress: AddressSchema.optional(),
})

export const UpdateDoctorSchema = z.object({
  name: z.string().min(1).optional(),
  crmNumber: z
    .string()
    .regex(/^\d{6}$/, 'CRM deve conter 6 dígitos')
    .optional(),
  crmState: z.string().length(2).optional(),
  specialties: z.array(z.string().min(1)).optional(),
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
