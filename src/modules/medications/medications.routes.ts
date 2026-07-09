import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CreateMedicationSchema,
  DeactivateMedicationSchema,
  ListMedicationsQuerySchema,
  RecordDoseSchema,
  UpdateMedicationSchema,
} from './medications.schema.js'
import { medicationsService } from './medications.service.js'

const FAMILY_WRITERS = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER'] as const
// Excluir é ação administrativa — FAMILY_MEMBER fica de fora (ver medications.service.ts).
const MEDICATION_DELETERS = ['PATIENT_ADMIN', 'CAREGIVER'] as const

export default async function medicationsRoutes(fastify: FastifyInstance) {
  // GET /medications?memberId=&active=
  fastify.get('/medications', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListMedicationsQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }

    const filters = query.data.active === undefined ? {} : { active: query.data.active }
    const medications = await medicationsService.list(req.user, query.data.memberId, filters)
    return reply.status(200).send({ data: medications })
  })

  // POST /medications
  fastify.post(
    '/medications',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const body = CreateMedicationSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const medication = await medicationsService.create(req.user, body.data)
      return reply.status(201).send({ data: medication })
    },
  )

  // PATCH /medications/:id
  fastify.patch(
    '/medications/:id',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateMedicationSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const medication = await medicationsService.update(req.user, id, body.data)
      return reply.status(200).send({ data: medication })
    },
  )

  // DELETE /medications/:id — soft, seta active: false
  fastify.delete(
    '/medications/:id',
    { preHandler: [authenticate, authorize(...MEDICATION_DELETERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = DeactivateMedicationSchema.safeParse(req.body ?? {})
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      await medicationsService.deactivate(req.user, id, body.data.reason)
      return reply.status(204).send()
    },
  )

  // POST /medications/:id/doses
  fastify.post(
    '/medications/:id/doses',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = RecordDoseSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const dose = await medicationsService.recordDose(req.user, id, body.data)
      return reply.status(201).send({ data: dose })
    },
  )

  // GET /medications/:id/doses
  fastify.get('/medications/:id/doses', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const doses = await medicationsService.listDoses(req.user, id)
    return reply.status(200).send({ data: doses })
  })

  // DELETE /medications/:id/doses/:doseId — desfazer registro de dose
  fastify.delete(
    '/medications/:id/doses/:doseId',
    { preHandler: [authenticate, authorize(...FAMILY_WRITERS)] },
    async (req, reply) => {
      const { id, doseId } = req.params as { id: string; doseId: string }
      await medicationsService.deleteDose(req.user, id, doseId)
      return reply.status(204).send()
    },
  )
}
