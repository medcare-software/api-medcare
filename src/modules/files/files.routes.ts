import type { FastifyInstance } from 'fastify'

import { authenticate } from '../../shared/middlewares/index.js'
import { filesService } from './files.service.js'

export default async function filesRoutes(fastify: FastifyInstance) {
  // POST /files/upload — multipart, bucket privado (MinIO)
  fastify.post('/files/upload', { preHandler: [authenticate] }, async (req, reply) => {
    const file = await req.file()
    if (!file) {
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Nenhum arquivo enviado' })
    }
    const buffer = await file.toBuffer()
    const result = await filesService.upload(req.user, {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    })
    return reply.status(201).send({ data: result })
  })

  // GET /files/:fileId/signed-url — URL assinada de curta duração
  fastify.get('/files/:fileId/signed-url', { preHandler: [authenticate] }, async (req, reply) => {
    const { fileId } = req.params as { fileId: string }
    const result = await filesService.getSignedUrl(fileId)
    return reply.status(200).send({ data: result })
  })
}
