import { z } from 'zod'
import { requiredDate } from '../../shared/utils/zod-date.js'

const ExamSourceEnum = z.enum(['GMAIL', 'DOCTOR', 'MANUAL'])
const ExamTypeEnum = z.enum(['LABORATORIAL', 'IMAGEM', 'OUTROS'])

export const CreateExamSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  name: z.string().min(1, { message: 'Nome do exame é obrigatório' }),
  examType: ExamTypeEnum.default('OUTROS'),
  clinicName: z.string().min(1, { message: 'Nome da clínica é obrigatório' }).optional(),
  examDate: requiredDate('Data do exame inválida'),
  fileId: z.string().min(1, { message: 'Anexo inválido' }).optional(),
  source: ExamSourceEnum.default('MANUAL'),
})

export const UpdateExamSchema = CreateExamSchema.omit({ memberId: true }).partial()

export const ListExamsQuerySchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
})

export type CreateExamInput = z.infer<typeof CreateExamSchema>
export type UpdateExamInput = z.infer<typeof UpdateExamSchema>
