import { z } from 'zod'

const ExamSourceEnum = z.enum(['GMAIL', 'DOCTOR', 'MANUAL'])

export const CreateExamSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1),
  examDate: z.coerce.date(),
  fileId: z.string().min(1).optional(),
  source: ExamSourceEnum.default('MANUAL'),
})

export const UpdateExamSchema = CreateExamSchema.omit({ memberId: true }).partial()

export const ListExamsQuerySchema = z.object({
  memberId: z.string().min(1),
})

export type CreateExamInput = z.infer<typeof CreateExamSchema>
export type UpdateExamInput = z.infer<typeof UpdateExamSchema>
