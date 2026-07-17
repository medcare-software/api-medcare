import { z } from 'zod'
import { requiredDate } from '../../shared/utils/zod-date.js'

const BiologicalSexEnum = z.enum(['MALE', 'FEMALE'])

// POST /auth/register — cria o User(PATIENT_ADMIN) + Family + FamilyMember admin
export const RegisterSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  phone: z.string().min(8, { message: 'Telefone inválido' }).optional(),
  state: z.string().length(2).optional(),
  cpf: z.string().min(11, 'CPF inválido'),
  fullName: z.string().min(1, { message: 'Nome completo é obrigatório' }),
  displayName: z.string().min(1, { message: 'Nome de exibição é obrigatório' }),
  birthDate: requiredDate('Data de nascimento inválida', {
    notFuture: true,
    futureMessage: 'Data de nascimento não pode ser no futuro',
  }),
  biologicalSex: BiologicalSexEnum.optional(),
})

// Sem o .superRefine — base compartilhada com UpdateFamilyMemberSchema, que não
// deve herdar a regra de "cpf obrigatório com email" (edição parcial de membro
// já existente não é o escopo do requisito de criar login).
const CreateFamilyMemberFields = z.object({
  fullName: z.string().min(1, { message: 'Nome completo é obrigatório' }),
  displayName: z.string().min(1, { message: 'Nome de exibição é obrigatório' }),
  relationship: z.string().min(1, { message: 'Parentesco é obrigatório' }),
  birthDate: requiredDate('Data de nascimento inválida', {
    notFuture: true,
    futureMessage: 'Data de nascimento não pode ser no futuro',
  }),
  biologicalSex: BiologicalSexEnum.optional(),
  cpf: z.string().min(11, { message: 'CPF inválido' }).optional(),
  // Quando informado, o membro ganha login próprio (User com role FAMILY_MEMBER)
  // e recebe um e-mail com link para definir a senha — ver families.service.ts.
  email: z.string().email({ message: 'E-mail inválido' }).optional(),
})

export const CreateFamilyMemberSchema = CreateFamilyMemberFields.superRefine((data, ctx) => {
  if (data.email && !data.cpf) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cpf'],
      message: 'CPF é obrigatório para criar login com e-mail',
    })
  }
})

export const UpdateFamilyMemberSchema = CreateFamilyMemberFields.partial().extend({
  isAdmin: z.boolean().optional(),
})

export const UpsertHealthProfileSchema = z.object({
  weightKg: z.number().positive({ message: 'Peso deve ser um número positivo' }).optional(),
  heightM: z.number().positive({ message: 'Altura deve ser um número positivo' }).optional(),
  bloodType: z.string().min(1, { message: 'Tipo sanguíneo é obrigatório' }).optional(),
  conditions: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  notes: z.string().min(1, { message: 'Observação não pode ser vazia' }).optional(),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>
export type UpdateFamilyMemberInput = z.infer<typeof UpdateFamilyMemberSchema>
export type UpsertHealthProfileInput = z.infer<typeof UpsertHealthProfileSchema>
