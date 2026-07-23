import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { ConfirmGmailImportedExamSchema } from './gmail-import.schema.js'
import { gmailImportService } from './gmail-import.service.js'

const GMAIL_IMPORT_ROLES = ['PATIENT_ADMIN', 'FAMILY_MEMBER'] as const

export default async function gmailImportRoutes(fastify: FastifyInstance) {
  // GET /gmail-imported-exams — laudos PENDING do usuário autenticado, aguardando revisão
  fastify.get(
    '/gmail-imported-exams',
    { preHandler: [authenticate, authorize(...GMAIL_IMPORT_ROLES)] },
    async (req, reply) => {
      const items = await gmailImportService.listPending(req.user.id)
      return reply.status(200).send({ data: items })
    },
  )

  // GET /gmail-imported-exams/:id
  fastify.get(
    '/gmail-imported-exams/:id',
    { preHandler: [authenticate, authorize(...GMAIL_IMPORT_ROLES)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const item = await gmailImportService.getById(req.user.id, id)
      return reply.status(200).send({ data: item })
    },
  )

  // POST /gmail-imported-exams/:id/confirm — vincula ao membro escolhido, cria o Exam
  fastify.post(
    '/gmail-imported-exams/:id/confirm',
    { preHandler: [authenticate, authorize(...GMAIL_IMPORT_ROLES)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = ConfirmGmailImportedExamSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const exam = await gmailImportService.confirm(req.user.id, id, body.data.memberId)
      return reply.status(200).send({ data: exam })
    },
  )

  // POST /gmail-imported-exams/:id/reject — apaga o arquivo, marca REJECTED
  fastify.post(
    '/gmail-imported-exams/:id/reject',
    { preHandler: [authenticate, authorize(...GMAIL_IMPORT_ROLES)] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      await gmailImportService.reject(req.user.id, id)
      return reply.status(204).send()
    },
  )
}
