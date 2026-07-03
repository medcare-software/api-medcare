import { z } from 'zod'

const ProcedureStatusEnum = z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])

export const CreateProcedureSchema = z.object({
  memberId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  performedAt: z.coerce.date(),
  status: ProcedureStatusEnum.default('IN_PROGRESS'),
})

export const UpdateProcedureSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  performedAt: z.coerce.date().optional(),
  status: ProcedureStatusEnum.optional(),
})

export const ListProceduresQuerySchema = z.object({
  memberId: z.string().min(1),
})

export type CreateProcedureInput = z.infer<typeof CreateProcedureSchema>
export type UpdateProcedureInput = z.infer<typeof UpdateProcedureSchema>
