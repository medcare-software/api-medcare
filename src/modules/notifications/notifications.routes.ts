import type { FastifyInstance } from 'fastify'

import { authenticate } from '../../shared/middlewares/index.js'
import { RegisterPushTokenSchema, UpsertNotificationPreferenceSchema } from './notifications.schema.js'
import { notificationsService } from './notifications.service.js'

export default async function notificationsRoutes(fastify: FastifyInstance) {
  // GET /notifications/preferences — só as próprias, qualquer role autenticada
  fastify.get('/notifications/preferences', { preHandler: [authenticate] }, async (req, reply) => {
    const preferences = await notificationsService.list(req.user)
    return reply.status(200).send({ data: preferences })
  })

  // PUT /notifications/preferences — upsert por (userId, channel, category)
  fastify.put('/notifications/preferences', { preHandler: [authenticate] }, async (req, reply) => {
    const body = UpsertNotificationPreferenceSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    const preference = await notificationsService.upsert(req.user, body.data)
    return reply.status(200).send({ data: preference })
  })

  // DELETE /notifications/preferences/:id
  fastify.delete(
    '/notifications/preferences/:id',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await notificationsService.remove(req.user, id)
      return reply.status(204).send()
    },
  )

  // POST /notifications/push-token — registra/atualiza o token Expo do device atual
  fastify.post('/notifications/push-token', { preHandler: [authenticate] }, async (req, reply) => {
    const body = RegisterPushTokenSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    await notificationsService.registerPushToken(req.user, body.data)
    return reply.status(204).send()
  })
}
