import type {
  AnvisaImportOperation,
  AnvisaImportStatus,
  AnvisaListType,
  AnvisaMedicationStatus,
  Prisma,
} from '@prisma/client'

import { db } from '../../config/database.js'

type ListFilters = {
  listType: AnvisaListType
  /** EXCLUDED only, or statuses for vigentes */
  statuses: AnvisaMedicationStatus[]
  search?: string
}

type CatalogFilters = {
  search?: string
  listType?: AnvisaListType
}

export type AnvisaUpsertRow = {
  listType: AnvisaListType
  substance: string
  holder: string
  medicationName: string
  registrationNumber: string
  concentration: string
  pharmaceuticalForm: string
  includedAt: Date | null
  excludedAt: Date | null
  exclusionReason: string | null
  /** Status desejado no create; no update ADDITION o repo preserva ACTIVE/INACTIVE */
  status: AnvisaMedicationStatus
  lastImportId: string
  operation: AnvisaImportOperation
}

function searchWhere(search: string): Prisma.AnvisaReferenceMedicationWhereInput {
  return {
    OR: [
      { substance: { contains: search, mode: 'insensitive' } },
      { holder: { contains: search, mode: 'insensitive' } },
      { medicationName: { contains: search, mode: 'insensitive' } },
      { registrationNumber: { contains: search, mode: 'insensitive' } },
      { concentration: { contains: search, mode: 'insensitive' } },
    ],
  }
}

function listWhere(filters: ListFilters): Prisma.AnvisaReferenceMedicationWhereInput {
  return {
    listType: filters.listType,
    status: { in: filters.statuses },
    ...(filters.search && searchWhere(filters.search)),
  }
}

export const anvisaMedicationsRepository = {
  findMany(filters: ListFilters, pagination: { skip: number; take: number }) {
    return db.anvisaReferenceMedication.findMany({
      where: listWhere(filters),
      // ACTIVE antes de INACTIVE no enum → desativados no final
      orderBy: [
        { status: 'asc' },
        { substance: 'asc' },
        { medicationName: 'asc' },
        { concentration: 'asc' },
      ],
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  count(filters: ListFilters) {
    return db.anvisaReferenceMedication.count({ where: listWhere(filters) })
  },

  findById(id: string) {
    return db.anvisaReferenceMedication.findUnique({ where: { id } })
  },

  updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    return db.anvisaReferenceMedication.update({
      where: { id },
      data: { status },
    })
  },

  findCatalog(filters: CatalogFilters, pagination: { skip: number; take: number }) {
    return db.anvisaReferenceMedication.findMany({
      where: {
        status: 'ACTIVE',
        ...(filters.listType && { listType: filters.listType }),
        ...(filters.search && searchWhere(filters.search)),
      },
      orderBy: [{ medicationName: 'asc' }, { concentration: 'asc' }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        listType: true,
        substance: true,
        holder: true,
        medicationName: true,
        registrationNumber: true,
        concentration: true,
        pharmaceuticalForm: true,
      },
    })
  },

  countCatalog(filters: CatalogFilters) {
    return db.anvisaReferenceMedication.count({
      where: {
        status: 'ACTIVE',
        ...(filters.listType && { listType: filters.listType }),
        ...(filters.search && searchWhere(filters.search)),
      },
    })
  },

  findActiveKeys(listType: AnvisaListType) {
    return db.anvisaReferenceMedication.findMany({
      where: { listType, status: 'ACTIVE' },
      select: {
        id: true,
        registrationNumber: true,
        concentration: true,
        pharmaceuticalForm: true,
      },
    })
  },

  createImport(data: {
    listType: AnvisaListType
    operation: AnvisaImportOperation
    fileId: string
    sourceFilename: string
    uploadedById?: string
  }) {
    return db.anvisaListImport.create({
      data: {
        listType: data.listType,
        operation: data.operation,
        fileId: data.fileId,
        sourceFilename: data.sourceFilename,
        ...(data.uploadedById ? { uploadedById: data.uploadedById } : {}),
        status: 'PROCESSING',
      },
    })
  },

  updateImport(
    id: string,
    data: {
      parsedCount?: number
      createdCount?: number
      updatedCount?: number
      deactivatedCount?: number
      excludedCount?: number
      status?: AnvisaImportStatus
      errorMessage?: string | null
      completedAt?: Date | null
    },
  ) {
    return db.anvisaListImport.update({ where: { id }, data })
  },

  async upsertRow(row: AnvisaUpsertRow) {
    const existing = await db.anvisaReferenceMedication.findUnique({
      where: {
        listType_registrationNumber_concentration_pharmaceuticalForm: {
          listType: row.listType,
          registrationNumber: row.registrationNumber,
          concentration: row.concentration,
          pharmaceuticalForm: row.pharmaceuticalForm,
        },
      },
      select: { id: true, status: true },
    })

    if (existing) {
      let nextStatus = row.status
      if (row.operation === 'ADDITION') {
        // Preserva toggle ACTIVE/INACTIVE; reinclusão ANVISA a partir de EXCLUDED → ACTIVE
        if (existing.status === 'ACTIVE' || existing.status === 'INACTIVE') {
          nextStatus = existing.status
        } else {
          nextStatus = 'ACTIVE'
        }
      }

      await db.anvisaReferenceMedication.update({
        where: { id: existing.id },
        data: {
          substance: row.substance,
          holder: row.holder,
          medicationName: row.medicationName,
          ...(row.includedAt ? { includedAt: row.includedAt } : {}),
          ...(row.operation === 'REMOVAL'
            ? {
                excludedAt: row.excludedAt,
                exclusionReason: row.exclusionReason,
              }
            : {}),
          status: nextStatus,
          lastImportId: row.lastImportId,
        },
      })
      return 'updated' as const
    }

    await db.anvisaReferenceMedication.create({
      data: {
        listType: row.listType,
        substance: row.substance,
        holder: row.holder,
        medicationName: row.medicationName,
        registrationNumber: row.registrationNumber,
        concentration: row.concentration,
        pharmaceuticalForm: row.pharmaceuticalForm,
        includedAt: row.includedAt,
        excludedAt: row.excludedAt,
        exclusionReason: row.exclusionReason,
        status: row.status,
        lastImportId: row.lastImportId,
      },
    })
    return 'created' as const
  },

  deactivateMissing(ids: string[], importId: string) {
    if (ids.length === 0) return Promise.resolve({ count: 0 })
    return db.anvisaReferenceMedication.updateMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      data: { status: 'INACTIVE', lastImportId: importId },
    })
  },
}
