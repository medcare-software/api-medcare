import { z } from 'zod'

const BiologicalSexEnum = z.enum(['MALE', 'FEMALE'])

// POST /auth/register — cria o User(PATIENT_ADMIN) + Family + FamilyMember admin
export const RegisterSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  phone: z.string().min(8).optional(),
  cpf: z.string().min(11, 'CPF inválido'),
  fullName: z.string().min(1),
  displayName: z.string().min(1),
  birthDate: z.coerce.date(),
  biologicalSex: BiologicalSexEnum.optional(),
})

export const CreateFamilyMemberSchema = z.object({
  fullName: z.string().min(1),
  displayName: z.string().min(1),
  relationship: z.string().min(1),
  birthDate: z.coerce.date(),
  biologicalSex: BiologicalSexEnum.optional(),
  cpf: z.string().min(11).optional(),
})

export const UpdateFamilyMemberSchema = CreateFamilyMemberSchema.partial()

export const UpsertHealthProfileSchema = z.object({
  weightKg: z.number().positive().optional(),
  heightM: z.number().positive().optional(),
  bloodType: z.string().min(1).optional(),
  conditions: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  notes: z.string().min(1).optional(),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>
export type UpdateFamilyMemberInput = z.infer<typeof UpdateFamilyMemberSchema>
export type UpsertHealthProfileInput = z.infer<typeof UpsertHealthProfileSchema>
