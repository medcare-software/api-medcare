import type { FastifyInstance } from 'fastify'

import { authenticate } from '../../shared/middlewares/index.js'
import { CheckMedicationRiskSchema } from './medication-risk-check.schema.js'
import { medicationRiskCheckService } from './medication-risk-check.service.js'

export default async function medicationRiskCheckRoutes(fastify: FastifyInstance) {
  // POST /medications/check-risk — chamado pelo app/web ANTES do POST real de
  // criação (medicação ou receituário), para mostrar o aviso de interação/alergia
  // e pedir confirmação explícita do usuário antes de seguir.
  fastify.post('/medications/check-risk', { preHandler: [authenticate] }, async (req, reply) => {
    const body = CheckMedicationRiskSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    const result = await medicationRiskCheckService.check(req.user, body.data)
    return reply.status(200).send({ data: result })
  })
}
