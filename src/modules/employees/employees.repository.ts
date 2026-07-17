import type { UserStatus } from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

type EmployeeListFilters = {
  status?: UserStatus
  search?: string
}

type CreateEmployeeData = {
  name: string
  email: string
  phone?: string
  profileLabel: string
}

type UpdateEmployeeData = {
  name?: string
  email?: string
  phone?: string
  profileLabel?: string
  status?: UserStatus
}

export const employeesRepository = {
  findByEmail(email: string) {
    return db.employee.findFirst({ where: { email: email.toLowerCase(), deletedAt: null } })
  },

  findMany(filters: EmployeeListFilters, pagination: { skip: number; take: number }) {
    return db.employee.findMany({
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

  count(filters: EmployeeListFilters) {
    return db.employee.count({
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
    return db.employee.findFirst({ where: { id, deletedAt: null } })
  },

  create(data: CreateEmployeeData) {
    return db.employee.create({
      data: omitUndefined({ ...data, email: data.email.toLowerCase(), status: 'ACTIVE' }),
    })
  },

  update(id: string, data: UpdateEmployeeData) {
    return db.employee.update({
      where: { id },
      data: omitUndefined({ ...data, ...(data.email && { email: data.email.toLowerCase() }) }),
    })
  },

  softDelete(id: string) {
    return db.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    })
  },
}
