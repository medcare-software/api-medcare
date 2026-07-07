import { z } from 'zod'
import { optionalDate, requiredDate } from '../../shared/utils/zod-date'

export const CreateDiagnosticSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  title: z.string().min(1, { message: 'Título é obrigatório' }),
  description: z.string().min(1, { message: 'Descrição é obrigatória' }),
  conduct: z.string().min(1, { message: 'Conduta é obrigatória' }),
  diagnosedAt: requiredDate('Data do diagnóstico inválida'),
})

export const UpdateDiagnosticSchema = z.object({
  title: z.string().min(1, { message: 'Título é obrigatório' }).optional(),
  description: z.string().min(1, { message: 'Descrição é obrigatória' }).optional(),
  conduct: z.string().min(1, { message: 'Conduta é obrigatória' }).optional(),
  diagnosedAt: optionalDate('Data do diagnóstico inválida'),
})

export const ListDiagnosticsQuerySchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
})

export type CreateDiagnosticInput = z.infer<typeof CreateDiagnosticSchema>
export type UpdateDiagnosticInput = z.infer<typeof UpdateDiagnosticSchema>
