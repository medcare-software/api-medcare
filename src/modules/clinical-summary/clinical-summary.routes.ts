import type { FastifyInstance } from 'fastify'

import { authenticate } from '../../shared/middlewares/index.js'
import { GetClinicalSummaryQuerySchema } from './clinical-summary.schema.js'
import { clinicalSummaryService } from './clinical-summary.service.js'

export default async function clinicalSummaryRoutes(fastify: FastifyInstance) {
  // GET /clinical-summary?memberId= — tipo sanguíneo, alergias, condições e
  // observações clínicas, somente leitura (quem escreve é a família, ver families module).
  fastify.get('/clinical-summary', { preHandler: [authenticate] }, async (req, reply) => {
    const query = GetClinicalSummaryQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const summary = await clinicalSummaryService.get(req.user, query.data.memberId)
    return reply.status(200).send({ data: summary })
  })
}
