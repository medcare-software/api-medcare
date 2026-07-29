import { AppError } from '../../shared/errors/index.js'
import { recordAuditEvent } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { filesService } from '../files/files.service.js'
import { naturalKey, parseAnvisaPdf } from './anvisa-medications.parser.js'
import { anvisaMedicationsRepository } from './anvisa-medications.repository.js'
import type {
  CatalogAnvisaMedicationsQuery,
  ImportAnvisaFields,
  ListAnvisaMedicationsQuery,
} from './anvisa-medications.schema.js'

function fallback(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : '-'
}

export const anvisaMedicationsService = {
  async list(query: ListAnvisaMedicationsQuery) {
    const filters = {
      listType: query.listType,
      ...(query.status && { status: query.status }),
      ...(query.search && { search: query.search }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [items, total] = await Promise.all([
      anvisaMedicationsRepository.findMany(filters, pagination),
      anvisaMedicationsRepository.count(filters),
    ])
    return { items, total }
  },

  /** Catálogo para cadastro de novo medicamento — somente ACTIVE. Nunca afeta Medication de prontuário. */
  async catalog(query: CatalogAnvisaMedicationsQuery) {
    const filters = {
      ...(query.listType && { listType: query.listType }),
      ...(query.search && { search: query.search }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [items, total] = await Promise.all([
      anvisaMedicationsRepository.findCatalog(filters, pagination),
      anvisaMedicationsRepository.countCatalog(filters),
    ])
    return { items, total }
  },

  async import(
    actor: AuthUser,
    fields: ImportAnvisaFields,
    file: { buffer: Buffer; filename: string; mimetype: string },
  ) {
    if (file.mimetype !== 'application/pdf' && !file.filename.toLowerCase().endsWith('.pdf')) {
      throw new AppError({ code: 'VALIDATION_ERROR', message: 'Envie um arquivo PDF da ANVISA' })
    }

    const uploaded = await filesService.upload(actor, file)
    const importRecord = await anvisaMedicationsRepository.createImport({
      listType: fields.listType,
      operation: fields.operation,
      fileId: uploaded.fileId,
      sourceFilename: file.filename,
      uploadedById: actor.id,
    })

    try {
      const parsed = await parseAnvisaPdf(file.buffer, {
        listType: fields.listType,
        operation: fields.operation,
      })

      if (parsed.length === 0) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'Nenhum medicamento encontrado no PDF',
        })
      }

      let createdCount = 0
      let updatedCount = 0
      let excludedCount = 0
      const seenKeys = new Set<string>()

      for (const row of parsed) {
        const key = naturalKey(row, fields.listType)
        seenKeys.add(key)

        const status = fields.operation === 'ADDITION' ? 'ACTIVE' : 'EXCLUDED'
        const result = await anvisaMedicationsRepository.upsertRow({
          listType: fields.listType,
          substance: fallback(row.substance),
          holder: fallback(row.holder),
          medicationName: fallback(row.medicationName),
          registrationNumber: row.registrationNumber,
          concentration: fallback(row.concentration),
          pharmaceuticalForm: fallback(row.pharmaceuticalForm),
          includedAt: row.includedAt,
          excludedAt: row.excludedAt,
          exclusionReason: row.exclusionReason,
          status,
          lastImportId: importRecord.id,
        })

        if (result === 'created') createdCount += 1
        else updatedCount += 1
        if (status === 'EXCLUDED') excludedCount += 1
      }

      let deactivatedCount = 0
      if (fields.operation === 'ADDITION') {
        const active = await anvisaMedicationsRepository.findActiveKeys(fields.listType)
        const missingIds = active
          .filter((item) => {
            const key = `${fields.listType}|${item.registrationNumber}|${item.concentration}|${item.pharmaceuticalForm}`
            return !seenKeys.has(key)
          })
          .map((item) => item.id)

        // Inativa só o catálogo — NÃO altera Medication de prontuário do paciente
        const deactivated = await anvisaMedicationsRepository.deactivateMissing(
          missingIds,
          importRecord.id,
        )
        deactivatedCount = deactivated.count
      }

      const completed = await anvisaMedicationsRepository.updateImport(importRecord.id, {
        parsedCount: parsed.length,
        createdCount,
        updatedCount,
        deactivatedCount,
        excludedCount,
        status: 'COMPLETED',
        completedAt: new Date(),
      })

      await recordAuditEvent({
        actorId: actor.id,
        action: 'IMPORT_ANVISA_MEDICATIONS',
        targetType: 'AnvisaListImport',
        targetId: importRecord.id,
        metadata: {
          listType: fields.listType,
          operation: fields.operation,
          parsedCount: parsed.length,
          createdCount,
          updatedCount,
          deactivatedCount,
          excludedCount,
        },
      })

      return completed
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao processar PDF'
      await anvisaMedicationsRepository.updateImport(importRecord.id, {
        status: 'FAILED',
        errorMessage: message,
        completedAt: new Date(),
      })
      if (error instanceof AppError) throw error
      throw new AppError({ code: 'INTERNAL_SERVER_ERROR', message })
    }
  },
}
