import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { DashboardQuerySchema } from './dashboard.schema.js'
import { dashboardService } from './dashboard.service.js'

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // GET /admin/dashboard?months= — métricas agregadas da plataforma (só PLATFORM_ADMIN)
  fastify.get(
    '/admin/dashboard',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = DashboardQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const overview = await dashboardService.getOverview(query.data)
      return reply.status(200).send({ data: overview })
    },
  )
}
