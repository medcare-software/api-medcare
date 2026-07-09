import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { CreateExamSchema, ListExamsQuerySchema, UpdateExamSchema } from './exams.schema.js'
import { examsService } from './exams.service.js'

const EXAM_WRITERS = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER', 'DOCTOR'] as const
const EXAM_DELETERS = ['PATIENT_ADMIN', 'CAREGIVER', 'DOCTOR'] as const

export default async function examsRoutes(fastify: FastifyInstance) {
  // GET /exams?memberId=
  fastify.get('/exams', { preHandler: [authenticate] }, async (req, reply) => {
    const query = ListExamsQuerySchema.safeParse(req.query)
    if (!query.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: query.error.issues,
      })
    }
    const exams = await examsService.list(req.user, query.data.memberId)
    return reply.status(200).send({ data: exams })
  })

  // POST /exams
  fastify.post(
    '/exams',
    { preHandler: [authenticate, authorize(...EXAM_WRITERS)] },
    async (req, reply) => {
      const body = CreateExamSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const exam = await examsService.create(req.user, body.data)
      return reply.status(201).send({ data: exam })
    },
  )

  // PATCH /exams/:id
  fastify.patch(
    '/exams/:id',
    { preHandler: [authenticate, authorize(...EXAM_WRITERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = UpdateExamSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const exam = await examsService.update(req.user, id, body.data)
      return reply.status(200).send({ data: exam })
    },
  )

  // DELETE /exams/:id
  fastify.delete(
    '/exams/:id',
    { preHandler: [authenticate, authorize(...EXAM_DELETERS)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await examsService.remove(req.user, id)
      return reply.status(204).send()
    },
  )
}
