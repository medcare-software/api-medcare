import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { ListAuditLogsQuerySchema } from './audit-logs.schema.js'
import { auditLogsService } from './audit-logs.service.js'

export default async function auditLogsRoutes(fastify: FastifyInstance) {
  // GET /audit-logs?actorId=&targetType=&action=&dateFrom=&dateTo=&page=&pageSize=
  fastify.get(
    '/audit-logs',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListAuditLogsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const { items, total } = await auditLogsService.list(query.data)
      return reply.status(200).send({
        data: items,
        meta: { total, page: query.data.page, pageSize: query.data.pageSize },
      })
    },
  )
}
