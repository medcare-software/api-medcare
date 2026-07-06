import { z } from 'zod'

const NotificationChannelEnum = z.enum(['PUSH', 'WHATSAPP'])

// NotificationPreference.category é String livre no Prisma (documentado via
// comentário no schema) — travamos os valores aceitos aqui, na borda da API.
const NotificationCategoryEnum = z.enum(['medicines', 'medicalRecord', 'family'])

export const UpsertNotificationPreferenceSchema = z.object({
  channel: NotificationChannelEnum,
  category: NotificationCategoryEnum,
  enabled: z.boolean().default(true),
  reminderMinutesBefore: z.number().int().nonnegative().nullable().optional(),
})

export type UpsertNotificationPreferenceInput = z.infer<typeof UpsertNotificationPreferenceSchema>

export const RegisterPushTokenSchema = z.object({
  token: z.string().min(1, { message: 'Token é obrigatório' }),
  platform: z.enum(['ios', 'android']),
})

export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenSchema>
