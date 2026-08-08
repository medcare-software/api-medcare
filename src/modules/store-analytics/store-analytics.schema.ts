import { z } from 'zod'

export const StoreDownloadsQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
})

export const SyncStoreDownloadsSchema = z.object({
  daysBack: z.coerce.number().int().positive().max(90).default(30),
})

export type StoreDownloadsQuery = z.infer<typeof StoreDownloadsQuerySchema>
export type SyncStoreDownloadsInput = z.infer<typeof SyncStoreDownloadsSchema>
