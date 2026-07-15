import { z } from 'zod'

export const DashboardQuerySchema = z.object({
  months: z.coerce.number().int().positive().max(24).default(12),
})

export type DashboardQuery = z.infer<typeof DashboardQuerySchema>
