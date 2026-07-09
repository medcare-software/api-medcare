import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateVaccineSchema,
  ListVaccinesQuerySchema,
  RecordVaccineDoseSchema,
  UpdateVaccineSchema,
} from './vaccines.schema.js'
import { vaccinesService } from './vaccines.service.js'

const FAMILY_WRITERS = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] as const
const VACCINE_DELETERS = ['PATIENT_ADMIN', 'CAREGIVER'] as const

export default async function vaccinesRoutes(fastify: FastifyInstance) {
  // GET /vaccines?memberId=
  fastify.get('/vaccines', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListVaccinesQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const vaccines = await vaccinesService.list(req.user, query.data.memberId)
    return reply.status(200).send({ data: vaccines })
  })

  // POST /vaccines
  fastify.post(
    '/vaccines',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const body = CreateVaccineSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const vaccine = await vaccinesService.create(req.user, body.data)
      return reply.status(201).send({ data: vaccine })
    },
  )

  // PATCH /vaccines/:id
  fastify.patch(
    '/vaccines/:id',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateVaccineSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const vaccine = await vaccinesService.update(req.user, id, body.data)
      return reply.status(200).send({ data: vaccine })
    },
  )

  // DELETE /vaccines/:id — remoção definitiva (sem soft-delete no schema)
  fastify.delete(
    '/vaccines/:id',
    { preHandler: [authenticate, authorize(...VACCINE_DELETERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await vaccinesService.remove(req.user, id)
      return reply.status(204).send()
    },
  )

  // POST /vaccines/:id/doses
  fastify.post(
    '/vaccines/:id/doses',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = RecordVaccineDoseSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const dose = await vaccinesService.recordDose(req.user, id, body.data)
      return reply.status(201).send({ data: dose })
    },
  )

  // GET /vaccines/:id/doses
  fastify.get('/vaccines/:id/doses', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const doses = await vaccinesService.listDoses(req.user, id)
    return reply.status(200).send({ data: doses })
  })
}
