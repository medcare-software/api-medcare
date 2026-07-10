import {
  type MedicationScanResult,
  extractMedicationFromImage,
} from '../../shared/ai/anthropic-vision.client.js'
import { AppError } from '../../shared/errors/index.js'
import { filesRepository } from '../files/files.repository.js'

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number]

const UNSUPPORTED_MEDIA_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'application/octet-stream',
])

function normalizeContentType(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined
  const base = contentType.split(';')[0]?.trim().toLowerCase()
  if (!base) return undefined
  // Alguns clients enviam image/jpg — Anthropic só aceita image/jpeg.
  if (base === 'image/jpg') return 'image/jpeg'
  return base
}

function resolveMediaType(contentType: string | undefined): SupportedMediaType {
  const normalized = normalizeContentType(contentType)

  if (!normalized) {
    // Content-Type ausente no objeto (uploads legados) — fotos da câmera do app
    // são JPEG; fallback seguro só quando o header não foi gravado.
    return 'image/jpeg'
  }

  if ((SUPPORTED_MEDIA_TYPES as readonly string[]).includes(normalized)) {
    return normalized as SupportedMediaType
  }

  if (UNSUPPORTED_MEDIA_TYPES.has(normalized)) {
    throw new AppError({
      code: 'INVALID_INPUT',
      message:
        'Formato de imagem não suportado. Tire a foto novamente em JPEG ou PNG.',
    })
  }

  throw new AppError({
    code: 'INVALID_INPUT',
    message:
      'Formato de imagem não suportado. Use JPEG, PNG ou WebP e tente novamente.',
  })
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
