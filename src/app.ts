import { Prisma } from '@prisma/client'
import Fastify from 'fastify'

import { env } from './config/env.js'
import auditLogsRoutes from './modules/audit-logs/audit-logs.routes.js'
import authRoutes from './modules/auth/auth.routes.js'
import caregiverRoutes from './modules/caregiver/caregiver.routes.js'
import clinicalHistoryRoutes from './modules/clinical-history/clinical-history.routes.js'
import clinicalSummaryRoutes from './modules/clinical-summary/clinical-summary.routes.js'
import clinicsRoutes from './modules/clinics/clinics.routes.js'
import dashboardRoutes from './modules/dashboard/dashboard.routes.js'
import diagnosticsRoutes from './modules/diagnostics/diagnostics.routes.js'
import doctorsRoutes from './modules/doctors/doctors.routes.js'
import employeesRoutes from './modules/employees/employees.routes.js'
import examsRoutes from './modules/exams/exams.routes.js'
import familiesRoutes from './modules/families/families.routes.js'
import filesRoutes from './modules/files/files.routes.js'
import financialRoutes from './modules/financial/financial.routes.js'
import gmailImportRoutes from './modules/gmail-import/gmail-import.routes.js'
import gmailIntegrationRoutes from './modules/gmail-integration/gmail-integration.routes.js'
import labEmailsRoutes from './modules/lab-emails/lab-emails.routes.js'
import medicalAccessRoutes from './modules/medical-access/medical-access.routes.js'
import medicationRiskCheckRoutes from './modules/medication-risk-check/medication-risk-check.routes.js'
import medicationScanRoutes from './modules/medication-scan/medication-scan.routes.js'
import medicationsRoutes from './modules/medications/medications.routes.js'
import notificationsRoutes from './modules/notifications/notifications.routes.js'
import paymentsRoutes from './modules/payments/payments.routes.js'
import plansRoutes from './modules/plans/plans.routes.js'
import prescriptionsRoutes from './modules/prescriptions/prescriptions.routes.js'
import proceduresRoutes from './modules/procedures/procedures.routes.js'
import reportsRoutes from './modules/reports/reports.routes.js'
import storeAnalyticsRoutes from './modules/store-analytics/store-analytics.routes.js'
import usersRoutes from './modules/users/users.routes.js'
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
  await app.register(dashboardRoutes, { prefix: env.API_PREFIX })
  await app.register(plansRoutes, { prefix: env.API_PREFIX })
  await app.register(paymentsRoutes, { prefix: env.API_PREFIX })
  await app.register(financialRoutes, { prefix: env.API_PREFIX })
  await app.register(notificationsRoutes, { prefix: env.API_PREFIX })
  await app.register(medicationsRoutes, { prefix: env.API_PREFIX })
  await app.register(medicationScanRoutes, { prefix: env.API_PREFIX })
  await app.register(medicationRiskCheckRoutes, { prefix: env.API_PREFIX })
  await app.register(vaccinesRoutes, { prefix: env.API_PREFIX })
  await app.register(examsRoutes, { prefix: env.API_PREFIX })
  await app.register(diagnosticsRoutes, { prefix: env.API_PREFIX })
  await app.register(proceduresRoutes, { prefix: env.API_PREFIX })
  await app.register(prescriptionsRoutes, { prefix: env.API_PREFIX })
  await app.register(clinicalHistoryRoutes, { prefix: env.API_PREFIX })
  await app.register(clinicalSummaryRoutes, { prefix: env.API_PREFIX })
  await app.register(medicalAccessRoutes, { prefix: env.API_PREFIX })
  await app.register(gmailIntegrationRoutes, { prefix: env.API_PREFIX })
  await app.register(gmailImportRoutes, { prefix: env.API_PREFIX })
  await app.register(filesRoutes, { prefix: env.API_PREFIX })
  await app.register(usersRoutes, { prefix: env.API_PREFIX })
  await app.register(employeesRoutes, { prefix: env.API_PREFIX })
  await app.register(labEmailsRoutes, { prefix: env.API_PREFIX })
  await app.register(auditLogsRoutes, { prefix: env.API_PREFIX })
  await app.register(reportsRoutes, { prefix: env.API_PREFIX })
  await app.register(storeAnalyticsRoutes, { prefix: env.API_PREFIX })

  return app
}
