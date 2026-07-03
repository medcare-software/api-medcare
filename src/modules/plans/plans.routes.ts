import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreatePlanSchema,
  CreateSubscriptionSchema,
  ListPlansQuerySchema,
  ListSubscriptionsQuerySchema,
  UpdatePlanSchema,
  UpdateSubscriptionSchema,
} from './plans.schema.js'
import { plansService } from './plans.service.js'

const SUBSCRIBERS = ['DOCTOR', 'CLINIC_ADMIN', 'PLATFORM_ADMIN'] as const

export default async function plansRoutes(fastify: FastifyInstance) {
  // GET /plans?type=&includeInactive= — catálogo, visível para qualquer autenticado
  fastify.get('/plans', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListPlansQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const plans = await plansService.list(req.user, query.data)
    return reply.status(200).send({ data: plans })
  })

  // GET /plans/:id
  fastify.get('/plans/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const plan = await plansService.getById(req.user, id)
    return reply.status(200).send({ data: plan })
  })

  // POST /plans
  fastify.post(
    '/plans',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const body = CreatePlanSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const plan = await plansService.create(body.data)
      return reply.status(201).send({ data: plan })
    },
  )

  // PATCH /plans/:id
  fastify.patch(
    '/plans/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdatePlanSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const plan = await plansService.update(id, body.data)
      return reply.status(200).send({ data: plan })
    },
  )

  // DELETE /plans/:id — status: INACTIVE (bloqueado se houver assinatura ativa)
  fastify.delete(
    '/plans/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await plansService.deactivate(id)
      return reply.status(204).send()
    },
  )

  // GET /subscriptions?doctorId=&clinicId=&status= — escopado por role no service
  fastify.get('/subscriptions', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListSubscriptionsQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const subscriptions = await plansService.listSubscriptions(req.user, query.data)
    return reply.status(200).send({ data: subscriptions })
  })

  // POST /subscriptions
  fastify.post(
    '/subscriptions',
    { preHandler: [authenticate, authorize(...SUBSCRIBERS)] },
    async (req, reply) => {
      const body = CreateSubscriptionSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const subscription = await plansService.createSubscription(req.user, body.data)
      return reply.status(201).send({ data: subscription })
    },
  )

  // PATCH /subscriptions/:id
  fastify.patch(
    '/subscriptions/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateSubscriptionSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const subscription = await plansService.updateSubscription(id, body.data)
      return reply.status(200).send({ data: subscription })
    },
  )

  // POST /subscriptions/:id/cancel — dono da assinatura ou PLATFORM_ADMIN
  fastify.post(
    '/subscriptions/:id/cancel',
    { preHandler: [authenticate, authorize(...SUBSCRIBERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const subscription = await plansService.cancelSubscription(req.user, id)
      return reply.status(200).send({ data: subscription })
    },
  )
}
