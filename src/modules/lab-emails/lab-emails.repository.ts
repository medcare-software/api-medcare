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

export const labEmailsRepository = {
  findByEmail(email: string) {
    return db.labEmail.findFirst({ where: { email: email.toLowerCase(), deletedAt: null } })
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
      data: { ...data, email: data.email.toLowerCase(), status: 'ACTIVE' },
    })
  },

  update(id: string, data: UpdateLabEmailData) {
    return db.labEmail.update({
      where: { id },
      data: omitUndefined({ ...data, ...(data.email && { email: data.email.toLowerCase() }) }),
    })
  },

  softDelete(id: string) {
    return db.labEmail.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    })
  },
}
