import { z } from 'zod'

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

const BaseMedicationSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1),
  dosage: z.string().min(1),
  dosageUnit: z.string().min(1),
  form: MedicationFormEnum,
  frequency: z.string().min(1),
  scheduleTimes: z.array(z.string()).default([]),
  weekDays: z.array(z.string()).default([]),
  specialInstructions: z.string().min(1).optional(),
  continuousUse: z.boolean().default(true),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  prescriptionFileId: z.string().min(1).optional(),
})

function endDateNotBeforeStartDate(data: { startDate?: Date | undefined; endDate?: Date | undefined }) {
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
  memberId: z.string().min(1),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
})

export const RecordDoseSchema = z.object({
  scheduledAt: z.coerce.date(),
  takenAt: z.coerce.date().optional(),
  state: DoseStateEnum,
})

export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>
export type UpdateMedicationInput = z.infer<typeof UpdateMedicationSchema>
export type ListMedicationsQuery = z.infer<typeof ListMedicationsQuerySchema>
export type RecordDoseInput = z.infer<typeof RecordDoseSchema>
