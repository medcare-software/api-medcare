import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateDoctorSchema,
  ListDoctorsQuerySchema,
  UpdateDoctorSchema,
  UpdateDoctorSelfSchema,
} from './doctors.schema.js'
import { doctorsService } from './doctors.service.js'

export default async function doctorsRoutes(fastify: FastifyInstance) {
  // POST /doctors — cadastra médico + User(role=DOCTOR). CLINIC_ADMIN pode
  // cadastrar médico próprio (senha temporária gerada no servidor, enviada por e-mail).
  fastify.post(
    '/doctors',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const body = CreateDoctorSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const doctor = await doctorsService.create(body.data)
      return reply.status(201).send({ data: doctor })
    },
  )

  // GET /doctors?status=&specialty=&search=&page=&pageSize=
  fastify.get(
    '/doctors',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const query = ListDoctorsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const doctors = await doctorsService.list(req.user, query.data)
      return reply.status(200).send({ data: doctors })
    },
  )

  // GET /doctors/me
  fastify.get(
    '/doctors/me',
    { preHandler: [authenticate, authorize('DOCTOR')] },
    async (req, reply) => {
      const doctor = await doctorsService.getSelf(req.user)
      return reply.status(200).send({ data: doctor })
    },
  )

  // GET /doctors/:id
  fastify.get(
    '/doctors/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const doctor = await doctorsService.getById(req.user, id)
      return reply.status(200).send({ data: doctor })
    },
  )

  // PATCH /doctors/me — médico edita só telefone/especialidades
  fastify.patch(
    '/doctors/me',
    { preHandler: [authenticate, authorize('DOCTOR')] },
    async (req, reply) => {
      const body = UpdateDoctorSelfSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const doctor = await doctorsService.updateSelf(req.user, body.data)
      return reply.status(200).send({ data: doctor })
    },
  )

  // PATCH /doctors/:id — CLINIC_ADMIN só edita médico vinculado à própria clínica
  fastify.patch(
    '/doctors/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN', 'CLINIC_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateDoctorSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const doctor = await doctorsService.update(req.user, id, body.data)
      return reply.status(200).send({ data: doctor })
    },
  )

  // DELETE /doctors/:id — soft delete (Doctor + User), revoga sessões
  fastify.delete(
    '/doctors/:id',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await doctorsService.deactivate(id)
      return reply.status(204).send()
    },
  )
}
