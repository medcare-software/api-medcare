import { z } from 'zod'

const VaccineStatusEnum = z.enum(['UP_TO_DATE', 'BOOSTER_DUE'])

export const CreateVaccineSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  name: z.string().min(1, { message: 'Nome da vacina é obrigatório' }),
  administrationRoute: z.string().min(1, { message: 'Via de administração é obrigatória' }),
  totalDoses: z.number().int().positive(),
  doseIntervalDays: z.number().int().positive().optional(),
  virusType: z.string().min(1).optional(),
  status: VaccineStatusEnum.default('UP_TO_DATE'),
})

export const UpdateVaccineSchema = CreateVaccineSchema.omit({ memberId: true }).partial()

export const ListVaccinesQuerySchema = z.object({
  memberId: z.string().min(1),
})

export const RecordVaccineDoseSchema = z
  .object({
    doseNumber: z.number().int().positive(),
    appliedAt: z.coerce.date(),
    manufacturer: z.string().min(1, { message: 'Fabricante é obrigatório' }),
    batchNumber: z.string().min(1, { message: 'Número do lote é obrigatório' }),
    location: z.string().min(1, { message: 'Local de aplicação é obrigatório' }),
    administrationRoute: z.string().min(1, { message: 'Via de administração é obrigatória' }),
    nextBoosterAt: z.coerce.date().optional(),
  })
  .refine((data) => data.appliedAt <= new Date(), {
    message: 'Data de aplicação não pode estar no futuro',
    path: ['appliedAt'],
  })

export type CreateVaccineInput = z.infer<typeof CreateVaccineSchema>
export type UpdateVaccineInput = z.infer<typeof UpdateVaccineSchema>
export type RecordVaccineDoseInput = z.infer<typeof RecordVaccineDoseSchema>
