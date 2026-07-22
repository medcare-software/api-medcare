import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateLabEmailSchema,
  ListLabEmailsQuerySchema,
  UpdateLabEmailSchema,
} from './lab-emails.schema.js'
import { labEmailsService } from './lab-emails.service.js'

export default async function labEmailsRoutes(fastify: FastifyInstance) {
  // POST /lab-emails
  fastify.post(
    '/lab-emails',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const body = CreateLabEmailSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const labEmail = await labEmailsService.create(req.user, body.data)
      return reply.status(201).send({ data: labEmail })
    },
  )

  // GET /lab-emails?status=&search=&page=&pageSize=
  fastify.get(
    '/lab-emails',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListLabEmailsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const { items, total } = await labEmailsService.list(query.data)
      return reply.status(200).send({
        data: items,
        meta: { total, page: query.data.page, pageSize: query.data.pageSize },
      })
    },
  )

  // GET /lab-emails/:id
  fastify.get(
    '/lab-emails/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const labEmail = await labEmailsService.getById(id)
      return reply.status(200).send({ data: labEmail })
    },
  )

  // PATCH /lab-emails/:id
  fastify.patch(
    '/lab-emails/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateLabEmailSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const labEmail = await labEmailsService.update(req.user, id, body.data)
      return reply.status(200).send({ data: labEmail })
    },
  )

  // DELETE /lab-emails/:id — soft delete
  fastify.delete(
    '/lab-emails/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await labEmailsService.delete(req.user, id)
      return reply.status(204).send()
    },
  )
}
