import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateProcedureSchema,
  ListProceduresQuerySchema,
  UpdateProcedureSchema,
} from './procedures.schema.js'
import { proceduresService } from './procedures.service.js'

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

  // POST /procedures — só DOCTOR, com grant ativo
  fastify.post(
    '/procedures',
    { preHandler: [authenticate, authorize('DOCTOR')] },
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

  // PATCH /procedures/:id — só o médico autor, inclui transições de status
  fastify.patch(
    '/procedures/:id',
    { preHandler: [authenticate, authorize('DOCTOR')] },
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
