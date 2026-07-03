import multipart from '@fastify/multipart'
import fp from 'fastify-plugin'

// Usado para upload de exames/prescrições — arquivos ficam em bucket privado (MinIO),
// nunca públicos. Ver módulo files (próxima etapa) para o handler de gravação.
export default fp(async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 5,
    },
  })
})
