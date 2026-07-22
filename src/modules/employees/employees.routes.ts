import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateEmployeeSchema,
  ListEmployeesQuerySchema,
  UpdateEmployeeSchema,
} from './employees.schema.js'
import { employeesService } from './employees.service.js'

export default async function employeesRoutes(fastify: FastifyInstance) {
  // POST /employees
  fastify.post(
    '/employees',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const body = CreateEmployeeSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const employee = await employeesService.create(fastify, req.user, body.data)
      return reply.status(201).send({ data: employee })
    },
  )

  // GET /employees?status=&search=&page=&pageSize=
  fastify.get(
    '/employees',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListEmployeesQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const { items, total } = await employeesService.list(query.data)
      return reply.status(200).send({
        data: items,
        meta: { total, page: query.data.page, pageSize: query.data.pageSize },
      })
    },
  )

  // GET /employees/:id
  fastify.get(
    '/employees/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const employee = await employeesService.getById(id)
      return reply.status(200).send({ data: employee })
    },
  )

  // PATCH /employees/:id
  fastify.patch(
    '/employees/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateEmployeeSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const employee = await employeesService.update(req.user, id, body.data)
      return reply.status(200).send({ data: employee })
    },
  )

  // DELETE /employees/:id — soft delete
  fastify.delete(
    '/employees/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await employeesService.delete(req.user, id)
      return reply.status(204).send()
    },
  )
}
