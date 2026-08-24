import cors from '@fastify/cors'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import { env } from '../../config/env.js'

/** Origens efêmeras do Expo Web (tunnel / metro) — não cabem em CORS_ORIGIN fixo. */
function isExpoDevOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
    return (
      hostname.endsWith('.exp.direct') ||
      hostname.endsWith('.expo.dev') ||
      hostname.endsWith('.ngrok-free.app') ||
      hostname.endsWith('.ngrok-free.dev') ||
      hostname.endsWith('.ngrok.io')
    )
  } catch {
    return false
  }
}

/** Painel, LP e site em medcaresw.com — CORS_ORIGIN do Railway às vezes omite um host. */
function isMedcareProductionOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== 'https:') return false
    return hostname === 'medcaresw.com' || hostname.endsWith('.medcaresw.com')
  } catch {
    return false
  }
}

const corsPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim())

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isExpoDevOrigin(origin) ||
        isMedcareProductionOrigin(origin)
      ) {
        cb(null, true)
        return
      }
      const error = new Error('Not allowed by CORS') as Error & { statusCode: number }
      error.statusCode = 403
      cb(error, false)
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
})

export default corsPlugin
