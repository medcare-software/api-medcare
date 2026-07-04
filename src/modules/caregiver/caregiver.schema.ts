import { z } from 'zod'

export const CreateCaregiverInviteSchema = z.object({
  email: z.string().email(),
})

export const RedeemCaregiverInviteSchema = z.object({
  code: z.string().regex(/^\d{6,8}$/, 'Código deve ter 6 a 8 dígitos'),
})

export type CreateCaregiverInviteInput = z.infer<typeof CreateCaregiverInviteSchema>
export type RedeemCaregiverInviteInput = z.infer<typeof RedeemCaregiverInviteSchema>
