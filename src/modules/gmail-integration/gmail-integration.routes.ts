import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { UpdateGmailSettingsSchema } from './gmail-integration.schema.js'
import { gmailIntegrationService } from './gmail-integration.service.js'

export default async function gmailIntegrationRoutes(fastify: FastifyInstance) {
  // POST /integrations/gmail/connect/start — app autenticado pede a URL de consentimento
  fastify.post(
    '/integrations/gmail/connect/start',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER')] },
    async (req, reply) => {
      const result = gmailIntegrationService.startConnect(fastify, req.user)
      return reply.status(200).send({ data: result })
    },
  )

  // GET /integrations/gmail/oauth-callback — só o Google bate aqui, sem header de auth
  fastify.get('/integrations/gmail/oauth-callback', async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string }
    const { redirectUrl } = await gmailIntegrationService.handleOAuthCallback(fastify, query)
    return reply.redirect(redirectUrl, 302)
  })

  // GET /integrations/gmail/status
  fastify.get(
    '/integrations/gmail/status',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER')] },
    async (req, reply) => {
      const status = await gmailIntegrationService.getStatus(req.user)
      return reply.status(200).send({ data: status })
    },
  )

  // PATCH /integrations/gmail/settings
  fastify.patch(
    '/integrations/gmail/settings',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER')] },
    async (req, reply) => {
      const body = UpdateGmailSettingsSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      await gmailIntegrationService.updateSettings(req.user, body.data)
      return reply.status(204).send()
    },
  )

  // POST /integrations/gmail/disconnect
  fastify.post(
    '/integrations/gmail/disconnect',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER')] },
    async (req, reply) => {
      await gmailIntegrationService.disconnect(req.user)
      return reply.status(204).send()
    },
  )
}
