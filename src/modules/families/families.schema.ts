import { z } from 'zod'
import { optionalDate, requiredDate } from '../../shared/utils/zod-date.js'

const BiologicalSexEnum = z.enum(['MALE', 'FEMALE'])

// POST /auth/register — cria o User(PATIENT_ADMIN) + Family + FamilyMember admin.
// Cadastro parcial do app: CPF + identidade + termos na 1ª etapa; nascimento/UF/cidade/
// sexo/saúde podem vir depois via CompleteOwnProfileSchema.
export const RegisterSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  phone: z.string().min(8, { message: 'Telefone inválido' }).optional(),
  state: z.string().length(2).optional(),
  city: z.string().optional(),
  cpf: z.string().min(11, 'CPF inválido'),
  fullName: z.string().min(1, { message: 'Nome completo é obrigatório' }),
  displayName: z.string().min(1, { message: 'Nome de exibição é obrigatório' }),
  birthDate: optionalDate('Data de nascimento inválida', {
    notFuture: true,
    futureMessage: 'Data de nascimento não pode ser no futuro',
  }),
  biologicalSex: BiologicalSexEnum.optional(),
  termsOfUseAccepted: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar os Termos de Uso' }),
  }),
  privacyPolicyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'É necessário aceitar a Política de Privacidade' }),
  }),
  lgpdConsentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'É necessário autorizar o processamento de dados conforme a LGPD' }),
  }),
})

// PUT /family-members/me/complete-profile — completa a 2ª parte do cadastro do próprio membro.
export const CompleteOwnProfileSchema = z.object({
  birthDate: requiredDate('Data de nascimento inválida', {
    notFuture: true,
    futureMessage: 'Data de nascimento não pode ser no futuro',
  }),
  state: z.string().length(2, { message: 'UF inválida' }),
  city: z.string().min(1, { message: 'Cidade é obrigatória' }),
  biologicalSex: BiologicalSexEnum,
  weightKg: z.number().positive({ message: 'Peso deve ser um número positivo' }),
  heightM: z.number().positive({ message: 'Altura deve ser um número positivo' }),
  bloodType: z.string().min(1, { message: 'Tipo sanguíneo é obrigatório' }),
  conditions: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  notes: z.string().min(1, { message: 'Observação não pode ser vazia' }).optional(),
})

// Sem o .superRefine — base compartilhada com UpdateFamilyMemberSchema.
// Create exige email + CPF (login sempre criado). Update permanece parcial.
const CreateFamilyMemberFields = z.object({
  fullName: z.string().min(1, { message: 'Nome completo é obrigatório' }),
  displayName: z.string().min(1, { message: 'Nome de exibição é obrigatório' }),
  relationship: z.string().min(1, { message: 'Parentesco é obrigatório' }),
  birthDate: requiredDate('Data de nascimento inválida', {
    notFuture: true,
    futureMessage: 'Data de nascimento não pode ser no futuro',
  }),
  biologicalSex: BiologicalSexEnum.optional(),
  cpf: z.string().min(11, { message: 'CPF inválido' }),
  // Membro sempre ganha login próprio (User FAMILY_MEMBER) + e-mail de ativação.
  email: z.string().email({ message: 'E-mail inválido' }),
})

export const CreateFamilyMemberSchema = CreateFamilyMemberFields

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
export type CompleteOwnProfileInput = z.infer<typeof CompleteOwnProfileSchema>
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>
export type UpdateFamilyMemberInput = z.infer<typeof UpdateFamilyMemberSchema>
export type UpsertHealthProfileInput = z.infer<typeof UpsertHealthProfileSchema>
