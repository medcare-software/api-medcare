import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateClinicSchema,
  LinkDoctorSchema,
  ListClinicDoctorsQuerySchema,
  ListClinicsQuerySchema,
  ToggleLinkSchema,
  UpdateClinicSchema,
  UpdateClinicSelfSchema,
} from './clinics.schema.js'
import { clinicsService } from './clinics.service.js'

export default async function clinicsRoutes(fastify: FastifyInstance) {
  // POST /clinics — cadastra clínica + User(role=CLINIC_ADMIN) + ClinicAdminProfile
  fastify.post(
    '/clinics',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const body = CreateClinicSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const clinic = await clinicsService.create(req.user, body.data)
      return reply.status(201).send({ data: clinic })
    },
  )

  // GET /clinics?status=&search=&page=&pageSize=
  fastify.get(
    '/clinics',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListClinicsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const { items, total } = await clinicsService.list(query.data)
      return reply.status(200).send({
        data: items,
        meta: { total, page: query.data.page, pageSize: query.data.pageSize },
      })
    },
  )

  // GET /clinics/me
  fastify.get(
    '/clinics/me',
    { preHandler: [authenticate, authorize('CLINIC_ADMIN')] },
    async (req, reply) => {
      const clinic = await clinicsService.getSelf(req.user)
      return reply.status(200).send({ data: clinic })
    },
  )

  // GET /clinics/:id
  fastify.get(
    '/clinics/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const clinic = await clinicsService.getById(req.user, id)
      return reply.status(200).send({ data: clinic })
    },
  )

  // PATCH /clinics/me — admin de clínica edita só os próprios dados de contato
  fastify.patch(
    '/clinics/me',
    { preHandler: [authenticate, authorize('CLINIC_ADMIN')] },
    async (req, reply) => {
      const body = UpdateClinicSelfSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const clinic = await clinicsService.updateSelf(req.user, body.data)
      return reply.status(200).send({ data: clinic })
    },
  )

  // PATCH /clinics/:id
  fastify.patch(
    '/clinics/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateClinicSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const clinic = await clinicsService.update(req.user, id, body.data)
      return reply.status(200).send({ data: clinic })
    },
  )

  // DELETE /clinics/:id — soft delete + desativa vínculos com médicos
  fastify.delete(
    '/clinics/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await clinicsService.deactivate(req.user, id)
      return reply.status(204).send()
    },
  )

  // GET /clinics/:id/doctors?includeInactive=
  fastify.get(
    '/clinics/:id/doctors',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const query = ListClinicDoctorsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const doctors = await clinicsService.listDoctors(req.user, id, query.data)
      return reply.status(200).send({ data: doctors })
    },
  )

  // POST /clinics/:id/doctors — vincula médico existente à clínica
  fastify.post(
    '/clinics/:id/doctors',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = LinkDoctorSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const link = await clinicsService.linkDoctor(req.user, id, body.data)
      return reply.status(201).send({ data: link })
    },
  )

  // PATCH /clinics/:id/doctors/:doctorId — ativa/desativa vínculo
  fastify.patch(
    '/clinics/:id/doctors/:doctorId',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id, doctorId } = req.params as { id: string; doctorId: string }
      const body = ToggleLinkSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const link = await clinicsService.toggleDoctorLink(req.user, id, doctorId, body.data)
      return reply.status(200).send({ data: link })
    },
  )
}
