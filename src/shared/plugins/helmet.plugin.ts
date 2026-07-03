import helmet from '@fastify/helmet'
import type { FastifyPluginAsync } from 'fastify'

import { env } from '../../config/env.js'

const helmetPlugin: FastifyPluginAsync = async (fastify) => {
  // Em desenvolvimento/teste, desabilita CSP para o Swagger UI carregar seus assets
  await fastify.register(helmet, {
    ...(env.NODE_ENV !== 'production' && { contentSecurityPolicy: false }),
  })
}

export default helmetPlugin
