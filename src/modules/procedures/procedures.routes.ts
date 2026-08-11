import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateProcedureSchema,
  ListProceduresQuerySchema,
  UpdateProcedureSchema,
} from './procedures.schema.js'
import { proceduresService } from './procedures.service.js'

const CLINICAL_WRITERS = ['DOCTOR', 'CLINIC_ADMIN'] as const

export default async function proceduresRoutes(fastify: FastifyInstance) {
  // GET /procedures?memberId=
  fastify.get('/procedures', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListProceduresQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const procedures = await proceduresService.list(req.user, query.data.memberId)
    return reply.status(200).send({ data: procedures })
  })

  // GET /procedures/:id
  fastify.get('/procedures/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const procedure = await proceduresService.getById(req.user, id)
    return reply.status(200).send({ data: procedure })
  })

  // POST /procedures — DOCTOR ou CLINIC_ADMIN com grant ativo
  fastify.post(
    '/procedures',
    { preHandler: [authenticate, authorize(...CLINICAL_WRITERS)] },
    async (req, reply) => {
      const body = CreateProcedureSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const procedure = await proceduresService.create(req.user, body.data)
      return reply.status(201).send({ data: procedure })
    },
  )

  // PATCH /procedures/:id — autor (médico do token ou do grant da clínica)
  fastify.patch(
    '/procedures/:id',
    { preHandler: [authenticate, authorize(...CLINICAL_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateProcedureSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const procedure = await proceduresService.update(req.user, id, body.data)
      return reply.status(200).send({ data: procedure })
    },
  )
}
