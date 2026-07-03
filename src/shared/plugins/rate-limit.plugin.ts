import rateLimit from '@fastify/rate-limit'
import type { FastifyPluginAsync } from 'fastify'

import { env } from '../../config/env.js'
import { redis } from '../../config/redis.js'

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    redis,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Retry after ${context.after}.`,
    }),
  })
}

export default rateLimitPlugin
