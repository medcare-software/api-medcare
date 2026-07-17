import type { Prisma } from '@prisma/client'

import { db } from '../../config/database.js'

type AuditLogListFilters = {
  actorId?: string
  targetType?: string
  action?: string
  search?: string
  dateFrom?: Date
  dateTo?: Date
}

function buildWhere(filters: AuditLogListFilters): Prisma.AuditLogWhereInput {
  return {
    ...(filters.actorId && { actorId: filters.actorId }),
    ...(filters.targetType && { targetType: filters.targetType }),
    ...(filters.action && { action: filters.action }),
    ...(filters.search && {
      OR: [
        { action: { contains: filters.search, mode: 'insensitive' } },
        { actor: { name: { contains: filters.search, mode: 'insensitive' } } },
      ],
    }),
    ...((filters.dateFrom || filters.dateTo) && {
      createdAt: {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      },
    }),
  }
}

export const auditLogsRepository = {
  findMany(filters: AuditLogListFilters, pagination: { skip: number; take: number }) {
    return db.auditLog.findMany({
      where: buildWhere(filters),
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  count(filters: AuditLogListFilters) {
    return db.auditLog.count({ where: buildWhere(filters) })
  },
}
