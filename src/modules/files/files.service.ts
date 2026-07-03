import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { filesRepository } from './files.repository.js'

export const filesService = {
  async upload(user: AuthUser, file: { buffer: Buffer; filename: string; mimetype: string }) {
    const fileId = filesRepository.generateObjectKey()
    await filesRepository.putObject(fileId, file.buffer, file.mimetype, {
      'x-amz-meta-uploader-id': user.id,
      'x-amz-meta-original-name': encodeURIComponent(file.filename),
    })
    return { fileId }
  },

  // fileId é um UUID não-adivinhável, sem vínculo de dono até ser anexado a um
  // registro de medications/exams — a segurança depende de só ser revelado a
  // quem já passou pelo gate de assertClinicalReadAccess do registro que o referencia.
  async getSignedUrl(fileId: string) {
    try {
      await filesRepository.statObject(fileId)
    } catch {
      throw new AppError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado' })
    }
    const url = await filesRepository.presignedGetUrl(fileId, env.FILE_SIGNED_URL_TTL_SECONDS)
    return { url, expiresIn: env.FILE_SIGNED_URL_TTL_SECONDS }
  },
}
