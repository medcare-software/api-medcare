import { z } from 'zod'
import { requiredDate } from '../../shared/utils/zod-date.js'

const ProcedureStatusEnum = z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])

export const CreateProcedureSchema = z.object({
  memberId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  observations: z.string().min(1).optional(),
  performedAt: requiredDate('Data do procedimento inválida', {
    notFuture: true,
    futureMessage: 'Data do procedimento não pode estar no futuro',
  }),
  status: ProcedureStatusEnum.default('IN_PROGRESS'),
})

// `reason` é opcional aqui de propósito — a exigência real (obrigatório só ao
// cancelar ou reabrir, não ao concluir) depende do status ATUAL do procedimento
// no banco, que o schema não enxerga; essa checagem acontece em
// procedures.service.ts#update() depois de carregar o registro.
export const UpdateProcedureSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  observations: z.string().min(1).optional(),
  performedAt: requiredDate('Data do procedimento inválida', {
    notFuture: true,
    futureMessage: 'Data do procedimento não pode estar no futuro',
  }).optional(),
  status: ProcedureStatusEnum.optional(),
  reason: z.string().min(1).optional(),
})

export const ListProceduresQuerySchema = z.object({
  memberId: z.string().min(1),
})

export type CreateProcedureInput = z.infer<typeof CreateProcedureSchema>
export type UpdateProcedureInput = z.infer<typeof UpdateProcedureSchema>
