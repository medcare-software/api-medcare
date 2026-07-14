import { z } from 'zod'

export const ListClinicalHistoryQuerySchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
})
