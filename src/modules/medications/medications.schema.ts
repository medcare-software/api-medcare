import { z } from 'zod'
import { optionalDate, requiredDate } from '../../shared/utils/zod-date.js'

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

const DoseStateEnum = z.enum(['TAKEN', 'LATE', 'MISSED'])

const MedicationStripeColorEnum = z.enum(['BLACK', 'RED', 'ORANGE', 'NONE'])

const BaseMedicationSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  name: z.string().min(1, { message: 'Nome do medicamento é obrigatório' }),
  dosage: z.string().min(1, { message: 'Dosagem é obrigatória' }),
  dosageUnit: z.string().min(1, { message: 'Unidade da dosagem é obrigatória' }),
  form: MedicationFormEnum,
  stripeColor: MedicationStripeColorEnum,
  frequency: z.string().min(1, { message: 'Frequência é obrigatória' }),
  scheduleTimes: z.array(z.string()).default([]),
  weekDays: z.array(z.string()).default([]),
  specialInstructions: z
    .string()
    .min(1, { message: 'Instrução especial não pode ser vazia' })
    .optional(),
  continuousUse: z.boolean().default(true),
  startDate: requiredDate('Data de início inválida', {
    notFuture: true,
    futureMessage: 'Data de início não pode estar no futuro',
  }),
  endDate: optionalDate('Data de término inválida'),
  stockQuantity: z
    .number()
    .int()
    .nonnegative({ message: 'Quantidade em estoque deve ser zero ou maior' })
    .optional(),
  prescriptionFileId: z.string().min(1, { message: 'Receita inválida' }).optional(),
  // Preenchido pelo app quando o usuário confirma "Entendi, salvar mesmo assim"
  // no modal de risco (ver medication-risk-check) — nunca vem sem uma checagem
  // de risco ter sido mostrada antes.
  riskAcknowledgedAt: z.coerce.date().optional(),
})

function endDateNotBeforeStartDate(data: {
  startDate?: Date | undefined
  endDate?: Date | undefined
}) {
  return !data.endDate || !data.startDate || data.endDate >= data.startDate
}

const dateRangeRefinement: { message: string; path: string[] } = {
  message: 'Data de término não pode ser anterior à data de início',
  path: ['endDate'],
}

export const CreateMedicationSchema = BaseMedicationSchema.refine(
  endDateNotBeforeStartDate,
  dateRangeRefinement,
)

export const UpdateMedicationSchema = BaseMedicationSchema.omit({ memberId: true })
  .partial()
  .refine(endDateNotBeforeStartDate, dateRangeRefinement)

export const ListMedicationsQuerySchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
})

export const RecordDoseSchema = z.object({
  scheduledAt: requiredDate('Data/hora agendada inválida'),
  takenAt: optionalDate('Data/hora da dose inválida'),
  state: DoseStateEnum,
})

export const DeactivateMedicationSchema = z.object({
  reason: z.string().min(1, { message: 'Motivo da exclusão é obrigatório' }),
})

export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>
export type UpdateMedicationInput = z.infer<typeof UpdateMedicationSchema>
export type ListMedicationsQuery = z.infer<typeof ListMedicationsQuerySchema>
export type RecordDoseInput = z.infer<typeof RecordDoseSchema>
export type DeactivateMedicationInput = z.infer<typeof DeactivateMedicationSchema>
