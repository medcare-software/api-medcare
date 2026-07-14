import type { FastifyInstance } from 'fastify'

import { authenticate } from '../../shared/middlewares/index.js'
import { ListClinicalHistoryQuerySchema } from './clinical-history.schema.js'
import { clinicalHistoryService } from './clinical-history.service.js'

export default async function clinicalHistoryRoutes(fastify: FastifyInstance) {
  // GET /clinical-history?memberId= — feed agregado de exames/diagnósticos/
  // procedimentos/medicações, somente leitura (ver clinical-history.service.ts)
  fastify.get('/clinical-history', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListClinicalHistoryQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const events = await clinicalHistoryService.list(req.user, query.data.memberId)
    return reply.status(200).send({ data: events })
  })
}
