import { z } from 'zod'
import { optionalDate, requiredDate } from '../../shared/utils/zod-date'

const VaccineStatusEnum = z.enum(['UP_TO_DATE', 'BOOSTER_DUE'])

export const CreateVaccineSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  name: z.string().min(1, { message: 'Nome da vacina é obrigatório' }),
  administrationRoute: z.string().min(1, { message: 'Via de administração é obrigatória' }),
  totalDoses: z.number().int().positive({ message: 'Número de doses deve ser maior que zero' }),
  doseIntervalDays: z
    .number()
    .int()
    .positive({ message: 'Intervalo entre doses deve ser maior que zero' })
    .optional(),
  virusType: z.string().min(1, { message: 'Tipo do vírus é obrigatório' }).optional(),
  status: VaccineStatusEnum.default('UP_TO_DATE'),
})

export const UpdateVaccineSchema = CreateVaccineSchema.omit({ memberId: true }).partial()

export const ListVaccinesQuerySchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
})

export const RecordVaccineDoseSchema = z
  .object({
    doseNumber: z.number().int().positive({ message: 'Número da dose deve ser maior que zero' }),
    appliedAt: requiredDate('Data de aplicação inválida'),
    manufacturer: z.string().min(1, { message: 'Fabricante é obrigatório' }),
    batchNumber: z.string().min(1, { message: 'Número do lote é obrigatório' }),
    location: z.string().min(1, { message: 'Local de aplicação é obrigatório' }),
    administrationRoute: z.string().min(1, { message: 'Via de administração é obrigatória' }),
    nextBoosterAt: optionalDate('Data do próximo reforço inválida'),
  })
  .refine((data) => data.appliedAt <= new Date(), {
    message: 'Data de aplicação não pode estar no futuro',
    path: ['appliedAt'],
  })

export type CreateVaccineInput = z.infer<typeof CreateVaccineSchema>
export type UpdateVaccineInput = z.infer<typeof UpdateVaccineSchema>
export type RecordVaccineDoseInput = z.infer<typeof RecordVaccineDoseSchema>
