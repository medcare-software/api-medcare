import jwt from '@fastify/jwt'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import { env } from '../../config/env.js'

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, { secret: env.JWT_ACCESS_SECRET })
}

// Expõe os decorators (`fastify.jwt`, `request.jwtVerify`, etc.) para toda a app
export default fp(jwtPlugin, { name: 'jwtPlugin' })
