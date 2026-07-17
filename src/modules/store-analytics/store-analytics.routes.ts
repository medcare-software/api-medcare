import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { StoreDownloadsQuerySchema } from './store-analytics.schema.js'
import { storeAnalyticsService } from './store-analytics.service.js'

export default async function storeAnalyticsRoutes(fastify: FastifyInstance) {
  // GET /admin/store-analytics/downloads?days=30 — downloads brutos por loja
  // (App Store Connect / Google Play), sem geografia nem vínculo com usuário
  // individual — ver store-analytics.service.ts.
  fastify.get(
    '/admin/store-analytics/downloads',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = StoreDownloadsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const data = await storeAnalyticsService.getAggregatedDownloads(query.data)
      return reply.status(200).send({ data })
    },
  )
}
