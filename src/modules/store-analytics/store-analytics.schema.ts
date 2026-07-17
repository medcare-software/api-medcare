import { z } from 'zod'

export const StoreDownloadsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
})

export type StoreDownloadsQuery = z.infer<typeof StoreDownloadsQuerySchema>
