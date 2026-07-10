import { Prisma } from '@prisma/client'
import Fastify from 'fastify'

import { env } from './config/env.js'
import authRoutes from './modules/auth/auth.routes.js'
import caregiverRoutes from './modules/caregiver/caregiver.routes.js'
import clinicsRoutes from './modules/clinics/clinics.routes.js'
import diagnosticsRoutes from './modules/diagnostics/diagnostics.routes.js'
import doctorsRoutes from './modules/doctors/doctors.routes.js'
import examsRoutes from './modules/exams/exams.routes.js'
import familiesRoutes from './modules/families/families.routes.js'
import filesRoutes from './modules/files/files.routes.js'
import financialRoutes from './modules/financial/financial.routes.js'
import medicalAccessRoutes from './modules/medical-access/medical-access.routes.js'
import medicationScanRoutes from './modules/medication-scan/medication-scan.routes.js'
import medicationsRoutes from './modules/medications/medications.routes.js'
import notificationsRoutes from './modules/notifications/notifications.routes.js'
import plansRoutes from './modules/plans/plans.routes.js'
import proceduresRoutes from './modules/procedures/procedures.routes.js'
import vaccinesRoutes from './modules/vaccines/vaccines.routes.js'
import { AppError } from './shared/errors/index.js'
import {
  corsPlugin,
  helmetPlugin,
  jwtPlugin,
  multipartPlugin,
  rateLimitPlugin,
  swaggerPlugin,
} from './shared/plugins/index.js'

// Nunca logar corpo/query por padrão — evita vazar CPF/PHI em texto plano nos logs
const REDACT = { paths: ['req.body', 'req.headers.authorization'], remove: true }

function buildLoggerConfig() {
  if (env.NODE_ENV === 'test') return false
  if (env.NODE_ENV === 'development') {
    return {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
      redact: REDACT,
    }
  }
  return { redact: REDACT }
}

export async function buildApp() {
  const app = Fastify({
    logger: buildLoggerConfig(),
  })

  // ── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON())
    }
    const statusCode = (error as { statusCode?: number }).statusCode
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        code: statusCode === 400 ? 'VALIDATION_ERROR' : 'REQUEST_ERROR',
        message: (error as Error).message,
      })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      request.log.error(error)
      return reply.status(500).send({
        code: 'DATABASE_ERROR',
        message: env.NODE_ENV === 'development' ? error.message : 'Database operation failed',
        ...(env.NODE_ENV === 'development' && { prismaCode: error.code, meta: error.meta }),
      })
    }
    request.log.error(error)
    return reply
      .status(500)
      .send({ code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' })
  })

  // Health check — registrado antes dos plugins para estar sempre acessível
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Shared plugins (a ordem importa) ────────────────────────────────────────
  await app.register(corsPlugin)
  await app.register(helmetPlugin)
  await app.register(rateLimitPlugin)
  await app.register(jwtPlugin)
  await app.register(swaggerPlugin)
  await app.register(multipartPlugin)

  // ── Módulos ───────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: env.API_PREFIX })
  await app.register(familiesRoutes, { prefix: env.API_PREFIX })
  await app.register(caregiverRoutes, { prefix: env.API_PREFIX })
  await app.register(doctorsRoutes, { prefix: env.API_PREFIX })
  await app.register(clinicsRoutes, { prefix: env.API_PREFIX })
  await app.register(plansRoutes, { prefix: env.API_PREFIX })
  await app.register(financialRoutes, { prefix: env.API_PREFIX })
  await app.register(notificationsRoutes, { prefix: env.API_PREFIX })
  await app.register(medicationsRoutes, { prefix: env.API_PREFIX })
  await app.register(medicationScanRoutes, { prefix: env.API_PREFIX })
  await app.register(vaccinesRoutes, { prefix: env.API_PREFIX })
  await app.register(examsRoutes, { prefix: env.API_PREFIX })
  await app.register(diagnosticsRoutes, { prefix: env.API_PREFIX })
  await app.register(proceduresRoutes, { prefix: env.API_PREFIX })
  await app.register(medicalAccessRoutes, { prefix: env.API_PREFIX })
  await app.register(filesRoutes, { prefix: env.API_PREFIX })

  return app
}
