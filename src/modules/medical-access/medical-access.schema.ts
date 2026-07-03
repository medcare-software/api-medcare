import { z } from 'zod'

export const CreateGrantSchema = z.object({
  memberId: z.string().min(1),
  validity: z.enum(['PERMANENT', 'TEMPORARY']).default('TEMPORARY'),
})

export const RedeemGrantSchema = z.object({
  code: z.string().regex(/^\d{6,8}$/, 'Código deve ter 6 a 8 dígitos'),
})

export type CreateGrantInput = z.infer<typeof CreateGrantSchema>
export type RedeemGrantInput = z.infer<typeof RedeemGrantSchema>
