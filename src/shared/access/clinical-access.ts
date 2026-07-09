import { AppError } from '../errors/index.js'
import { recordSensitiveAccess } from '../security/index.js'
import type { AuthUser } from '../types/auth.types.js'
import {
  assertActiveMedicalAccessGrant,
  assertOwnScopedMemberInScope,
  isFamilyRole,
} from './member-scope.js'

/**
 * Gate de leitura para os módulos clínicos (medications/vaccines/exams/diagnostics/procedures).
 * Papéis de família: PATIENT_ADMIN/CAREGIVER veem a família toda, FAMILY_MEMBER só o próprio
 * member (ver assertOwnScopedMemberInScope). DOCTOR/CLINIC_ADMIN: exige grant ativo e grava AuditLog.
 */
export async function assertClinicalReadAccess(
  user: AuthUser,
  memberId: string,
  audit: { action: string; targetType: string },
): Promise<void> {
  if (isFamilyRole(user.role)) {
    await assertOwnScopedMemberInScope(user, memberId)
    return
  }

  await assertActiveMedicalAccessGrant({ user, memberId })
  await recordSensitiveAccess({
    actorId: user.id,
    action: audit.action,
    targetType: audit.targetType,
    targetId: memberId,
  })
}

/** Gate de escrita para dados clínicos só registráveis por médico (diagnostics/procedures). */
export async function assertClinicalWriteAccess(user: AuthUser, memberId: string): Promise<void> {
  if (user.role !== 'DOCTOR') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Apenas médicos podem registrar este dado clínico',
    })
  }
  await assertActiveMedicalAccessGrant({ user, memberId })
}
