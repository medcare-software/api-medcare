import type { FastifyInstance } from 'fastify'

import { legalService } from './legal.service.js'

export default async function legalRoutes(fastify: FastifyInstance) {
  fastify.get('/legal', async (_req, reply) => {
    return reply.status(200).send({ data: legalService.getAll() })
  })

  fastify.get('/legal/terms-of-use', async (_req, reply) => {
    return reply.status(200).send({ data: legalService.getTermsOfUse() })
  })

  fastify.get('/legal/privacy-policy', async (_req, reply) => {
    return reply.status(200).send({ data: legalService.getPrivacyPolicy() })
  })

  fastify.get('/legal/professional-terms', async (_req, reply) => {
    return reply.status(200).send({ data: legalService.getProfessionalTerms() })
  })
}
