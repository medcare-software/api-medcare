import { z } from 'zod'

export const CreateDiagnosticSchema = z.object({
  memberId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  conduct: z.string().min(1),
  diagnosedAt: z.coerce.date(),
})

export const UpdateDiagnosticSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  conduct: z.string().min(1).optional(),
  diagnosedAt: z.coerce.date().optional(),
})

export const ListDiagnosticsQuerySchema = z.object({
  memberId: z.string().min(1),
})

export type CreateDiagnosticInput = z.infer<typeof CreateDiagnosticSchema>
export type UpdateDiagnosticInput = z.infer<typeof UpdateDiagnosticSchema>
