import { auditLogsRepository } from './audit-logs.repository.js'
import type { ListAuditLogsQuery } from './audit-logs.schema.js'

export const auditLogsService = {
  async list(query: ListAuditLogsQuery) {
    const filters = {
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.targetType && { targetType: query.targetType }),
      ...(query.action && { action: query.action }),
      ...(query.search && { search: query.search }),
      ...(query.dateFrom && { dateFrom: query.dateFrom }),
      ...(query.dateTo && { dateTo: query.dateTo }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [logs, total] = await Promise.all([
      auditLogsRepository.findMany(filters, pagination),
      auditLogsRepository.count(filters),
    ])

    const items = logs.map((log) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      metadata: log.metadata,
      createdAt: log.createdAt,
      actor: log.actor ? { id: log.actor.id, name: log.actor.name, role: log.actor.role } : null,
    }))
    return { items, total }
  },
}
