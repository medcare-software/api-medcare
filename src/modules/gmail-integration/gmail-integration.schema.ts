import { z } from 'zod'

export const UpdateGmailSettingsSchema = z.object({
  autoImportEnabled: z.boolean(),
})

export type UpdateGmailSettingsInput = z.infer<typeof UpdateGmailSettingsSchema>
