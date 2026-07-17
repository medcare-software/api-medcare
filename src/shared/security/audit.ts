import type { Prisma } from '@prisma/client'

import { db } from '../../config/database.js'

interface RecordAccessParams {
  actorId: string | null
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
}

/**
 * Registra no AuditLog qualquer acesso a dado sigiloso (decriptação de CPF/CNPJ,
 * leitura de prontuário por médico/admin, etc). Chamar sempre que um valor cifrado
 * for retornado sem máscara para alguém que não é o dono do dado.
 */
export async function recordSensitiveAccess(params: RecordAccessParams): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      ...(params.metadata !== undefined && {
        metadata: params.metadata as Prisma.InputJsonValue,
      }),
    },
  })
}

/**
 * Registra no AuditLog uma ação administrativa relevante (login, criação/edição
 * de clínica/médico/plano, vínculo de médico, force-reset de senha, etc) — sem
 * a conotação de "acesso a dado sigiloso" de recordSensitiveAccess, é só o
 * histórico de "quem fez o quê" consumido pela tela de Auditoria do admin.
 */
export async function recordAuditEvent(params: RecordAccessParams): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      ...(params.metadata !== undefined && {
        metadata: params.metadata as Prisma.InputJsonValue,
      }),
    },
  })
}
