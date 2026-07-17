import { z } from 'zod'

export const ListAuditLogsQuerySchema = z.object({
  actorId: z.string().min(1).optional(),
  targetType: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
})

export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>
