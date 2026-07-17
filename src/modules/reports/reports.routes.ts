import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  ChurnReportQuerySchema,
  ListReportPageQuerySchema,
  MedicationsReportQuerySchema,
} from './reports.schema.js'
import { reportsService } from './reports.service.js'

function validationError(reply: import('fastify').FastifyReply, issues: unknown) {
  return reply
    .status(400)
    .send({ code: 'VALIDATION_ERROR', message: 'Validation failed', details: issues })
}

export default async function reportsRoutes(fastify: FastifyInstance) {
  const guard = { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] }

  fastify.get('/admin/reports/clients', guard, async (req, reply) => {
    const query = ListReportPageQuerySchema.safeParse(req.query)
    if (!query.success) return validationError(reply, query.error.issues)
    return reply.status(200).send({ data: await reportsService.getClients(query.data) })
  })

  fastify.get('/admin/reports/doctors-clinics', guard, async (req, reply) => {
    const query = ListReportPageQuerySchema.safeParse(req.query)
    if (!query.success) return validationError(reply, query.error.issues)
    return reply.status(200).send({ data: await reportsService.getDoctorsClinics(query.data) })
  })

  fastify.get('/admin/reports/plans', guard, async (req, reply) => {
    const query = ListReportPageQuerySchema.safeParse(req.query)
    if (!query.success) return validationError(reply, query.error.issues)
    return reply.status(200).send({ data: await reportsService.getPlans(query.data) })
  })

  fastify.get('/admin/reports/financial', guard, async (req, reply) => {
    const query = ListReportPageQuerySchema.safeParse(req.query)
    if (!query.success) return validationError(reply, query.error.issues)
    return reply.status(200).send({ data: await reportsService.getFinancial(query.data) })
  })

  fastify.get('/admin/reports/growth', guard, async (_req, reply) => {
    return reply.status(200).send({ data: await reportsService.getGrowth() })
  })

  fastify.get('/admin/reports/medications', guard, async (req, reply) => {
    const query = MedicationsReportQuerySchema.safeParse(req.query)
    if (!query.success) return validationError(reply, query.error.issues)
    return reply.status(200).send({ data: await reportsService.getMedications(query.data) })
  })

  fastify.get('/admin/reports/churn', guard, async (req, reply) => {
    const query = ChurnReportQuerySchema.safeParse(req.query)
    if (!query.success) return validationError(reply, query.error.issues)
    return reply.status(200).send({ data: await reportsService.getChurn(query.data) })
  })
}
