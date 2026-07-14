import { z } from 'zod'
import { requiredDate } from '../../shared/utils/zod-date.js'

const StripeColorEnum = z.enum(['NONE', 'BLACK', 'RED', 'ORANGE'])
const ValidityEnum = z.enum(['DAYS_30', 'DAYS_60', 'DAYS_90', 'CONTINUOUS_USE'])

const PrescriptionItemSchema = z.object({
  name: z.string().min(1, { message: 'Nome do medicamento é obrigatório' }),
  dosage: z.string().min(1, { message: 'Dosagem é obrigatória' }),
  posology: z.string().min(1, { message: 'Posologia é obrigatória' }),
  duration: z.string().min(1, { message: 'Duração é obrigatória' }),
  instructions: z.string().optional(),
  stripeColor: StripeColorEnum.default('NONE'),
})

export const CreatePrescriptionSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  issueDate: requiredDate('Data de emissão inválida'),
  validity: ValidityEnum,
  linkedDiagnosticId: z.string().min(1).optional(),
  generalInstructions: z.string().optional(),
  items: z.array(PrescriptionItemSchema).min(1, { message: 'Adicione ao menos um medicamento' }),
})

export const UpdatePrescriptionSchema = z.object({
  issueDate: requiredDate('Data de emissão inválida').optional(),
  validity: ValidityEnum.optional(),
  linkedDiagnosticId: z.string().min(1).optional(),
  generalInstructions: z.string().optional(),
  items: z
    .array(PrescriptionItemSchema)
    .min(1, { message: 'Adicione ao menos um medicamento' })
    .optional(),
})

export const ListPrescriptionsQuerySchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
})

export type CreatePrescriptionInput = z.infer<typeof CreatePrescriptionSchema>
export type UpdatePrescriptionInput = z.infer<typeof UpdatePrescriptionSchema>
export type PrescriptionItemInput = z.infer<typeof PrescriptionItemSchema>
