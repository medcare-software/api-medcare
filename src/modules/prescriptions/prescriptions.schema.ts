import { z } from 'zod'
import { optionalDate, requiredDate } from '../../shared/utils/zod-date.js'

const StripeColorEnum = z.enum(['NONE', 'BLACK', 'RED', 'ORANGE'])
const ValidityEnum = z.enum(['DAYS_30', 'DAYS_60', 'DAYS_90', 'CONTINUOUS_USE'])
const MedicationFormEnum = z.enum([
  'TABLET',
  'CAPSULE',
  'DROPS',
  'INJECTION',
  'SYRUP',
  'OINTMENT',
  'PATCH',
  'OTHER',
])

const PrescriptionItemSchema = z.object({
  name: z.string().min(1, { message: 'Nome do medicamento é obrigatório' }),
  dosage: z.string().min(1, { message: 'Dosagem é obrigatória' }),
  posology: z.string().min(1, { message: 'Posologia é obrigatória' }),
  duration: z.string().min(1, { message: 'Duração é obrigatória' }),
  instructions: z.string().optional(),
  stripeColor: StripeColorEnum.default('NONE'),
  // Campos estruturados abaixo alimentam a criação automática do Medication
  // vinculado a este item (ver medications.internal.ts#createFromPrescriptionItem)
  // — dosage/posology/duration acima continuam livres, só para a receita impressa.
  form: MedicationFormEnum.optional(),
  dosageUnit: z.string().min(1).optional(),
  scheduleTimes: z.array(z.string()).default([]),
  weekDays: z.array(z.string()).default([]),
  startDate: optionalDate('Data de início inválida'),
  endDate: optionalDate('Data de término inválida'),
  continuousUse: z.boolean().optional(),
})

export const CreatePrescriptionSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  issueDate: requiredDate('Data de emissão inválida', {
    notFuture: true,
    futureMessage: 'Data de emissão não pode estar no futuro',
  }),
  validity: ValidityEnum,
  linkedDiagnosticId: z.string().min(1).optional(),
  generalInstructions: z.string().optional(),
  items: z.array(PrescriptionItemSchema).min(1, { message: 'Adicione ao menos um medicamento' }),
  // Preenchido pelo web quando o médico confirma "Entendi, salvar mesmo assim"
  // no modal de risco (ver POST /prescriptions/check-risk) — propagado pra cada
  // Medication criada a partir deste receituário.
  riskAcknowledgedAt: z.coerce.date().optional(),
})

export const CheckPrescriptionRiskSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  items: z
    .array(
      z.object({
        name: z.string().min(1, { message: 'Nome do medicamento é obrigatório' }),
        dosage: z.string().min(1, { message: 'Dosagem é obrigatória' }),
      }),
    )
    .min(1, { message: 'Adicione ao menos um medicamento' }),
})

export const UpdatePrescriptionSchema = z.object({
  issueDate: requiredDate('Data de emissão inválida', {
    notFuture: true,
    futureMessage: 'Data de emissão não pode estar no futuro',
  }).optional(),
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
export type CheckPrescriptionRiskInput = z.infer<typeof CheckPrescriptionRiskSchema>
