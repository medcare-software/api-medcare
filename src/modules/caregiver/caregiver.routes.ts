import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { CreateCaregiverInviteSchema, RedeemCaregiverInviteSchema } from './caregiver.schema.js'
import { caregiverService } from './caregiver.service.js'

export default async function caregiverRoutes(fastify: FastifyInstance) {
  // POST /families/:familyId/caregiver-invites — admin familiar convida por e-mail
  fastify.post(
    '/families/:familyId/caregiver-invites',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN')] },
    async (req, reply) => {
      const { familyId } = req.params as { familyId: string }
      const body = CreateCaregiverInviteSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const invite = await caregiverService.createInvite(req.user, familyId, body.data)
      return reply.status(201).send({ data: invite })
    },
  )

  // GET /families/:familyId/caregiver-invites
  fastify.get(
    '/families/:familyId/caregiver-invites',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN')] },
    async (req, reply) => {
      const { familyId } = req.params as { familyId: string }
      const invites = await caregiverService.listInvites(req.user, familyId)
      return reply.status(200).send({ data: invites })
    },
  )

  // PATCH /families/:familyId/caregiver-invites/:id/revoke
  fastify.patch(
    '/families/:familyId/caregiver-invites/:id/revoke',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN')] },
    async (req, reply) => {
      const { familyId, id } = req.params as { familyId: string; id: string }
      await caregiverService.revokeInvite(req.user, familyId, id)
      return reply.status(204).send()
    },
  )

  // POST /caregiver-invites/redeem — cuidador resgata o código recebido por e-mail
  fastify.post(
    '/caregiver-invites/redeem',
    { preHandler: [authenticate, authorize('CAREGIVER')] },
    async (req, reply) => {
      const body = RedeemCaregiverInviteSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const result = await caregiverService.redeem(req.user, body.data)
      return reply.status(200).send({ data: result })
    },
  )

  // GET /caregivers/me/families — famílias com CaregiverAccess ativo do cuidador logado
  fastify.get(
    '/caregivers/me/families',
    { preHandler: [authenticate, authorize('CAREGIVER')] },
    async (req, reply) => {
      const families = await caregiverService.listMyFamilies(req.user)
      return reply.status(200).send({ data: families })
    },
  )
}
