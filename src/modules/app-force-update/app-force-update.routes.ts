import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  ForceUpdatePlatformSchema,
  PatchForceUpdateSchema,
} from './app-force-update.schema.js'
import { appForceUpdateService } from './app-force-update.service.js'

export default async function appForceUpdateRoutes(fastify: FastifyInstance) {
  // Público — app consulta no boot / foreground
  fastify.get('/app-force-update', async (_req, reply) => {
    const items = await appForceUpdateService.listForApp()
    return reply.status(200).send({ data: items })
  })

  fastify.get(
    '/admin/app-force-update',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (_req, reply) => {
      const items = await appForceUpdateService.listForAdmin()
      return reply.status(200).send({ data: items })
    },
  )

  fastify.patch(
    '/admin/app-force-update/:platform',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const platformResult = ForceUpdatePlatformSchema.safeParse(
        (req.params as { platform?: string }).platform,
      )
      if (!platformResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Plataforma inválida (use ios ou android)',
        })
      }
      const body = PatchForceUpdateSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const item = await appForceUpdateService.patch(
        req.user,
        platformResult.data,
        body.data,
      )
      return reply.status(200).send({ data: item })
    },
  )

  fastify.post(
    '/admin/app-force-update/refresh',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const result = await appForceUpdateService.refreshFromStores(req.user)
      return reply.status(200).send({ data: result.items, errors: result.errors })
    },
  )
}
