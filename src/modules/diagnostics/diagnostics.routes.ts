import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateDiagnosticSchema,
  ListDiagnosticsQuerySchema,
  UpdateDiagnosticSchema,
} from './diagnostics.schema.js'
import { diagnosticsService } from './diagnostics.service.js'

export default async function diagnosticsRoutes(fastify: FastifyInstance) {
  // GET /diagnostics?memberId=
  fastify.get('/diagnostics', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListDiagnosticsQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const diagnostics = await diagnosticsService.list(req.user, query.data.memberId)
    return reply.status(200).send({ data: diagnostics })
  })

  // GET /diagnostics/:id
  fastify.get('/diagnostics/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const diagnostic = await diagnosticsService.getById(req.user, id)
    return reply.status(200).send({ data: diagnostic })
  })

  // POST /diagnostics — só DOCTOR, com grant ativo
  fastify.post(
    '/diagnostics',
    { preHandler: [authenticate, authorize('DOCTOR')] },
    async (req, reply) => {
      const body = CreateDiagnosticSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const diagnostic = await diagnosticsService.create(req.user, body.data)
      return reply.status(201).send({ data: diagnostic })
    },
  )

  // PATCH /diagnostics/:id — só o médico autor
  fastify.patch(
    '/diagnostics/:id',
    { preHandler: [authenticate, authorize('DOCTOR')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateDiagnosticSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const diagnostic = await diagnosticsService.update(req.user, id, body.data)
      return reply.status(200).send({ data: diagnostic })
    },
  )
}
