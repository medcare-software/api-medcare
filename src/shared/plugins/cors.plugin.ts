import cors from '@fastify/cors'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import { env } from '../../config/env.js'

const corsPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim())

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true)
        return
      }
      cb(new Error('Not allowed by CORS'), false)
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
})

export default corsPlugin
