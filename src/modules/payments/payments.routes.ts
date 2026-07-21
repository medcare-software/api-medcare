import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { ListClinicPaymentsQuerySchema } from './payments.schema.js'
import { paymentsService } from './payments.service.js'

export default async function paymentsRoutes(fastify: FastifyInstance) {
  // GET /clinics/:id/payments?year=&month=&status=&page=&pageSize=
  fastify.get(
    '/clinics/:id/payments',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const query = ListClinicPaymentsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Parâmetros inválidos' })
      }

      const { items, total, summary } = await paymentsService.listForClinic(
        req.user,
        id,
        query.data,
      )
      return reply.status(200).send({ data: items, meta: { total, ...summary } })
    },
  )

  // GET /clinics/:id/payments/latest-paid — data do último pagamento confirmado,
  // consumido pelo card "Status da assinatura" da aba Financeiro.
  fastify.get(
    '/clinics/:id/payments/latest-paid',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const latestPaidAt = await paymentsService.getLatestPaidDate(req.user, id)
      return reply.status(200).send({ data: { latestPaidAt } })
    },
  )
}
