import { z } from 'zod'

const VaccineStatusEnum = z.enum(['UP_TO_DATE', 'BOOSTER_DUE'])

export const CreateVaccineSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1),
  administrationRoute: z.string().min(1),
  totalDoses: z.number().int().positive(),
  doseIntervalDays: z.number().int().positive().optional(),
  virusType: z.string().min(1).optional(),
  status: VaccineStatusEnum.default('UP_TO_DATE'),
})

export const UpdateVaccineSchema = CreateVaccineSchema.omit({ memberId: true }).partial()

export const ListVaccinesQuerySchema = z.object({
  memberId: z.string().min(1),
})

export const RecordVaccineDoseSchema = z.object({
  doseNumber: z.number().int().positive(),
  appliedAt: z.coerce.date(),
  manufacturer: z.string().min(1),
  batchNumber: z.string().min(1),
  location: z.string().min(1),
  administrationRoute: z.string().min(1),
  nextBoosterAt: z.coerce.date().optional(),
})

export type CreateVaccineInput = z.infer<typeof CreateVaccineSchema>
export type UpdateVaccineInput = z.infer<typeof UpdateVaccineSchema>
export type RecordVaccineDoseInput = z.infer<typeof RecordVaccineDoseSchema>
