import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  StoreDownloadsQuerySchema,
  SyncStoreDownloadsSchema,
} from './store-analytics.schema.js'
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

  // POST /admin/store-analytics/sync — backfill manual (útil quando a tabela
  // está vazia e o cron diário só puxa D-1).
  fastify.post(
    '/admin/store-analytics/sync',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const body = SyncStoreDownloadsSchema.safeParse(req.body ?? {})
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const configured = storeAnalyticsService.isConfigured()
      if (!configured.ios && !configured.android) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message:
            'Nenhuma integração de loja configurada. Preencha APP_STORE_CONNECT_* e/ou GOOGLE_PLAY_* (inclui GOOGLE_PLAY_STORAGE_BUCKET).',
        })
      }
      await storeAnalyticsService.syncDownloads({
        daysBack: body.data.daysBack,
        throttleMs: 400,
      })
      const totals = await storeAnalyticsService.getAllTimeTotals()
      return reply.status(200).send({
        data: { configured, totals, daysBack: body.data.daysBack },
      })
    },
  )
}
