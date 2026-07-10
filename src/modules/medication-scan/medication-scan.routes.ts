import type { FastifyInstance } from 'fastify'

import { authenticate } from '../../shared/middlewares/index.js'
import { ScanMedicationSchema } from './medication-scan.schema.js'
import { medicationScanService } from './medication-scan.service.js'

export default async function medicationScanRoutes(fastify: FastifyInstance) {
  // POST /medications/scan — lê uma foto já enviada via /files/upload e extrai
  // nome/dosagem/tipo/tarja via IA de visão para pré-preencher o cadastro.
  fastify.post('/medications/scan', { preHandler: [authenticate] }, async (req, reply) => {
    const body = ScanMedicationSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    const result = await medicationScanService.scan(body.data.fileId)
    return reply.status(200).send({ data: result })
  })
}
