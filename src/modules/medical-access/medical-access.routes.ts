import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { CheckGrantSchema, CreateGrantSchema, RedeemGrantSchema } from './medical-access.schema.js'
import { medicalAccessService } from './medical-access.service.js'

export default async function medicalAccessRoutes(fastify: FastifyInstance) {
  // POST /medical-access/check — valida o código sem consumi-lo (feedback
  // imediato antes de escolher o médico responsável, ver InsertAccessCodeModal).
  fastify.post(
    '/medical-access/check',
    { preHandler: [authenticate, authorize('DOCTOR', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const body = CheckGrantSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      await medicalAccessService.checkCode(body.data)
      return reply.status(200).send({ data: { valid: true } })
    },
  )

  // POST /medical-access/grants — paciente/família gera o código
  fastify.post(
    '/medical-access/grants',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER')] },
    async (req, reply) => {
      const body = CreateGrantSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const grant = await medicalAccessService.createGrant(req.user, body.data)
      return reply.status(201).send({ data: grant })
    },
  )

  // POST /medical-access/redeem — médico/clínica resgata o código
  fastify.post(
    '/medical-access/redeem',
    { preHandler: [authenticate, authorize('DOCTOR', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const body = RedeemGrantSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const grant = await medicalAccessService.redeem(req.user, body.data)
      return reply.status(200).send({ data: grant })
    },
  )

  // GET /medical-access/grants — grants concedidos pelo próprio paciente/família
  fastify.get(
    '/medical-access/grants',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER')] },
    async (req, reply) => {
      const grants = await medicalAccessService.listMine(req.user)
      return reply.status(200).send({ data: grants })
    },
  )

  // PATCH /medical-access/grants/:id/revoke
  fastify.patch(
    '/medical-access/grants/:id/revoke',
    { preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await medicalAccessService.revoke(req.user, id)
      return reply.status(204).send()
    },
  )

  // GET /medical-access/my-grants — grants que o médico/clínica possui
  fastify.get(
    '/medical-access/my-grants',
    { preHandler: [authenticate, authorize('DOCTOR', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const grants = await medicalAccessService.listHeld(req.user)
      return reply.status(200).send({ data: grants })
    },
  )
}
