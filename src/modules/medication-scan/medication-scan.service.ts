import {
  type MedicationScanResult,
  extractMedicationFromImage,
} from '../../shared/ai/anthropic-vision.client.js'
import { AppError } from '../../shared/errors/index.js'
import { filesRepository } from '../files/files.repository.js'

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number]

function resolveMediaType(contentType: string | undefined): SupportedMediaType {
  if (contentType && (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(contentType)) {
    return contentType as SupportedMediaType
  }
  // Fotos da câmera do app sempre chegam como JPEG — fallback seguro para o
  // caso raro de o content-type não ter sido gravado no upload.
  return 'image/jpeg'
}

export const medicationScanService = {
  async scan(fileId: string): Promise<MedicationScanResult> {
    let contentType: string | undefined
    try {
      const stat = await filesRepository.statObject(fileId)
      contentType = stat.metaData?.['content-type']
    } catch {
      throw new AppError({ code: 'NOT_FOUND', message: 'Arquivo não encontrado' })
    }

    const buffer = await filesRepository.getObject(fileId)
    const imageBase64 = buffer.toString('base64')

    return extractMedicationFromImage(imageBase64, resolveMediaType(contentType))
  },
}
