import { z } from 'zod'

export const ForceUpdatePlatformSchema = z.enum(['ios', 'android'])

export const PatchForceUpdateSchema = z.object({
  forceUpdateEnabled: z.boolean(),
})

export type ForceUpdatePlatform = z.infer<typeof ForceUpdatePlatformSchema>
export type PatchForceUpdateInput = z.infer<typeof PatchForceUpdateSchema>
