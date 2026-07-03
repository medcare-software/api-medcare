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

export const CreateMedicationSchema = z.object({
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

export const UpdateMedicationSchema = CreateMedicationSchema.omit({ memberId: true }).partial()

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
