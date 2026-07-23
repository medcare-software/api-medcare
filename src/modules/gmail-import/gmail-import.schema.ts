import { z } from 'zod'

export const ConfirmGmailImportedExamSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
})

export type ConfirmGmailImportedExamInput = z.infer<typeof ConfirmGmailImportedExamSchema>
