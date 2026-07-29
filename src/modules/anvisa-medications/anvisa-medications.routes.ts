import type { FastifyInstance } from 'fastify'

import { authenticate, authorize } from '../../shared/middlewares/index.js'
import {
  CatalogAnvisaMedicationsQuerySchema,
  ImportAnvisaFieldsSchema,
  ListAnvisaMedicationsQuerySchema,
} from './anvisa-medications.schema.js'
import { anvisaMedicationsService } from './anvisa-medications.service.js'

export default async function anvisaMedicationsRoutes(fastify: FastifyInstance) {
  // GET /admin/anvisa-medications — listagem do painel admin
  fastify.get(
    '/admin/anvisa-medications',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      const query = ListAnvisaMedicationsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const { items, total } = await anvisaMedicationsService.list(query.data)
      return reply.status(200).send({
        data: items,
        meta: { total, page: query.data.page, pageSize: query.data.pageSize },
      })
    },
  )

  // POST /admin/anvisa-medications/import — upload PDF ANVISA + sync
  fastify.post(
    '/admin/anvisa-medications/import',
    { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] },
    async (req, reply) => {
      let fileBuffer: Buffer | null = null
      let filename = 'upload.pdf'
      let mimetype = 'application/pdf'
      const fieldValues: Record<string, string> = {}

      for await (const part of req.parts()) {
        if (part.type === 'file') {
          filename = part.filename
          mimetype = part.mimetype
          fileBuffer = await part.toBuffer()
        } else {
          fieldValues[part.fieldname] = String(part.value)
        }
      }

      if (!fileBuffer) {
        return reply
          .status(400)
          .send({ code: 'VALIDATION_ERROR', message: 'Nenhum arquivo enviado' })
      }

      const fields = ImportAnvisaFieldsSchema.safeParse({
        listType: fieldValues.listType,
        operation: fieldValues.operation,
      })
      if (!fields.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Informe listType (A|B) e operation (ADDITION|REMOVAL)',
          details: fields.error.issues,
        })
      }

      const result = await anvisaMedicationsService.import(req.user, fields.data, {
        buffer: fileBuffer,
        filename,
        mimetype,
      })

      return reply.status(201).send({
        data: {
          importId: result.id,
          parsedCount: result.parsedCount,
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          deactivatedCount: result.deactivatedCount,
          excludedCount: result.excludedCount,
          status: result.status,
        },
      })
    },
  )

  // GET /anvisa-medications/catalog — só ACTIVE, para cadastro de novo medicamento no app
  fastify.get(
    '/anvisa-medications/catalog',
    {
      preHandler: [
        authenticate,
        authorize('PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER', 'DOCTOR', 'PLATFORM_ADMIN'),
      ],
    },
    async (req, reply) => {
      const query = CatalogAnvisaMedicationsQuerySchema.safeParse(req.query)
      if (!query.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: query.error.issues,
        })
      }
      const { items, total } = await anvisaMedicationsService.catalog(query.data)
      return reply.status(200).send({
        data: items,
        meta: { total, page: query.data.page, pageSize: query.data.pageSize },
      })
    },
  )
}
