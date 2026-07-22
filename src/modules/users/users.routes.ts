import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { ListUsersQuerySchema } from './users.schema.js'
import { usersService } from './users.service.js'

export default async function usersRoutes(fastify: FastifyInstance) {
  // GET /users?role=&status=&search=&page=&pageSize=
  fastify.get(
    '/users',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListUsersQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const { items, total } = await usersService.list(query.data)
      return reply.status(200).send({
        data: items,
        meta: { total, page: query.data.page, pageSize: query.data.pageSize },
      })
    },
  )

  // GET /users/kpis
  fastify.get(
    '/users/kpis',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (_req, reply) => {
      const kpis = await usersService.getKpis()
      return reply.status(200).send({ data: kpis })
    },
  )

  // GET /users/:id
  fastify.get(
    '/users/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const user = await usersService.getById(req.user, id)
      return reply.status(200).send({ data: user })
    },
  )

  // GET /users/family-members/:id
  fastify.get(
    '/users/family-members/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const familyMember = await usersService.getFamilyMemberById(req.user, id)
      return reply.status(200).send({ data: familyMember })
    },
  )

  // POST /users/:id/force-reset-password
  fastify.post(
    '/users/:id/force-reset-password',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await usersService.forceResetPassword(req.user, id)
      return reply.status(204).send()
    },
  )
}
