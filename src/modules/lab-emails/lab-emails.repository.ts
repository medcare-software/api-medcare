import type { UserStatus } from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

type LabEmailListFilters = {
  status?: UserStatus
  search?: string
}

type CreateLabEmailData = {
  name: string
  email: string
}

type UpdateLabEmailData = {
  name?: string
  email?: string
  status?: UserStatus
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export const labEmailsRepository = {
  /** Ativo (não soft-deleted). */
  findByEmail(email: string) {
    return db.labEmail.findFirst({
      where: { email: normalizeEmail(email), deletedAt: null },
    })
  },

  /** Inclui soft-deleted — usado pra detectar colisão no UNIQUE de `email`. */
  findByEmailAny(email: string) {
    return db.labEmail.findFirst({
      where: { email: normalizeEmail(email) },
    })
  },

  findMany(filters: LabEmailListFilters, pagination: { skip: number; take: number }) {
    return db.labEmail.findMany({
      where: {
        deletedAt: null,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  count(filters: LabEmailListFilters) {
    return db.labEmail.count({
      where: {
        deletedAt: null,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
    })
  },

  findById(id: string) {
    return db.labEmail.findFirst({ where: { id, deletedAt: null } })
  },

  create(data: CreateLabEmailData) {
    return db.labEmail.create({
      data: { ...data, email: normalizeEmail(data.email), status: 'ACTIVE' },
    })
  },

  /** Reativa um registro soft-deleted e atualiza nome/e-mail. */
  restore(id: string, data: CreateLabEmailData) {
    return db.labEmail.update({
      where: { id },
      data: {
        name: data.name,
        email: normalizeEmail(data.email),
        status: 'ACTIVE',
        deletedAt: null,
      },
    })
  },

  update(id: string, data: UpdateLabEmailData) {
    return db.labEmail.update({
      where: { id },
      data: omitUndefined({
        ...data,
        ...(data.email && { email: normalizeEmail(data.email) }),
      }),
    })
  },

  softDelete(id: string, currentEmail: string) {
    const normalized = normalizeEmail(currentEmail)
    // Libera o UNIQUE em `email` para permitir re-cadastro do mesmo endereço.
    return db.labEmail.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
        email: `deleted.${id}.${normalized}`,
      },
    })
  },
}
