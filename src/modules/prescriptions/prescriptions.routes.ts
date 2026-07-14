import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreatePrescriptionSchema,
  ListPrescriptionsQuerySchema,
  UpdatePrescriptionSchema,
} from './prescriptions.schema.js'
import { prescriptionsService } from './prescriptions.service.js'

export default async function prescriptionsRoutes(fastify: FastifyInstance) {
  // GET /prescriptions?memberId=
  fastify.get('/prescriptions', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListPrescriptionsQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const prescriptions = await prescriptionsService.list(req.user, query.data.memberId)
    return reply.status(200).send({ data: prescriptions })
  })

  // GET /prescriptions/:id
  fastify.get('/prescriptions/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const prescription = await prescriptionsService.getById(req.user, id)
    return reply.status(200).send({ data: prescription })
  })

  // POST /prescriptions — só DOCTOR, com grant ativo
  fastify.post(
    '/prescriptions',
    { preHandler: [authenticate, authorize('DOCTOR')] },
    async (req, reply) => {
      const body = CreatePrescriptionSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const prescription = await prescriptionsService.create(req.user, body.data)
      return reply.status(201).send({ data: prescription })
    },
  )

  // PATCH /prescriptions/:id — só o médico autor
  fastify.patch(
    '/prescriptions/:id',
    { preHandler: [authenticate, authorize('DOCTOR')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdatePrescriptionSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const prescription = await prescriptionsService.update(req.user, id, body.data)
      return reply.status(200).send({ data: prescription })
    },
  )

  // DELETE /prescriptions/:id — só o médico autor
  fastify.delete(
    '/prescriptions/:id',
    { preHandler: [authenticate, authorize('DOCTOR')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await prescriptionsService.remove(req.user, id)
      return reply.status(204).send()
    },
  )
}
