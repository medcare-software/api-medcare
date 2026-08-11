import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CheckPrescriptionRiskSchema,
  CreatePrescriptionSchema,
  ListPrescriptionsQuerySchema,
  UpdatePrescriptionSchema,
} from './prescriptions.schema.js'
import { prescriptionsService } from './prescriptions.service.js'

const CLINICAL_WRITERS = ['DOCTOR', 'CLINIC_ADMIN'] as const

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

  // POST /prescriptions — DOCTOR ou CLINIC_ADMIN com grant ativo
  fastify.post(
    '/prescriptions',
    { preHandler: [authenticate, authorize(...CLINICAL_WRITERS)] },
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

  // POST /prescriptions/check-risk — chamado pelo web ANTES do submit final,
  // mostra aviso de interação/alergia e pede confirmação do médico antes de criar.
  fastify.post(
    '/prescriptions/check-risk',
    { preHandler: [authenticate, authorize(...CLINICAL_WRITERS)] },
    async (req, reply) => {
      const body = CheckPrescriptionRiskSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const result = await prescriptionsService.checkRisk(req.user, body.data)
      return reply.status(200).send({ data: result })
    },
  )

  // PATCH /prescriptions/:id — autor (médico do token ou do grant da clínica)
  fastify.patch(
    '/prescriptions/:id',
    { preHandler: [authenticate, authorize(...CLINICAL_WRITERS)] },
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

  // DELETE /prescriptions/:id — autor (médico do token ou do grant da clínica)
  fastify.delete(
    '/prescriptions/:id',
    { preHandler: [authenticate, authorize(...CLINICAL_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await prescriptionsService.remove(req.user, id)
      return reply.status(204).send()
    },
  )
}
