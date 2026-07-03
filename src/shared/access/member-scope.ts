import type { Role } from '@prisma/client'

import { db } from '../../config/database.js'
import { AppError } from '../errors/index.js'
import type { AuthUser } from '../types/auth.types.js'

// Roles que acessam o prontuário através do pertencimento a uma Family
// (PATIENT_ADMIN/FAMILY_MEMBER via FamilyMember.userId, CAREGIVER via CaregiverAccess).
const FAMILY_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']

export function isFamilyRole(role: Role): boolean {
  return FAMILY_ROLES.includes(role)
}

export async function resolveAccessibleFamilyIds(user: AuthUser): Promise<string[]> {
  if (user.role === 'CAREGIVER') {
    const accesses = await db.caregiverAccess.findMany({
      where: {
        caregiverId: user.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { familyId: true },
    })
    return accesses.map((access) => access.familyId)
  }

  if (isFamilyRole(user.role)) {
    const member = await db.familyMember.findUnique({ where: { userId: user.id } })
    return member ? [member.familyId] : []
  }

  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não tem acesso a registros familiares' })
}

/**
 * Todos os FamilyMember.id que o usuário pode ler/escrever: a própria família
 * (PATIENT_ADMIN/FAMILY_MEMBER) ou as famílias com CaregiverAccess ACTIVE (CAREGIVER).
 * PATIENT_ADMIN e FAMILY_MEMBER resolvem para o mesmo conjunto — toda a família —
 * já que não há hoje um campo que restrinja FAMILY_MEMBER a um subconjunto de membros.
 *
 * Nunca lança para "sem família vinculada" — retorna `[]` e deixa os asserts de
 * escopo (assertMemberInScope/assertFamilyInScope) converterem isso em NOT_FOUND,
 * preservando o contrato de nunca vazar existência via FORBIDDEN.
 */
export async function resolveAccessibleMemberIds(user: AuthUser): Promise<string[]> {
  const familyIds = await resolveAccessibleFamilyIds(user)
  if (familyIds.length === 0) {
    return []
  }

  const members = await db.familyMember.findMany({
    where: { familyId: { in: familyIds }, deletedAt: null },
    select: { id: true },
  })
  return members.map((member) => member.id)
}

/** Lança NOT_FOUND (nunca FORBIDDEN) para não vazar a existência de registro de outra família. */
export async function assertMemberInScope(user: AuthUser, memberId: string): Promise<void> {
  const memberIds = await resolveAccessibleMemberIds(user)
  if (!memberIds.includes(memberId)) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Registro não encontrado' })
  }
}

/** Lança NOT_FOUND (nunca FORBIDDEN) para não vazar a existência de família de terceiros. */
export async function assertFamilyInScope(user: AuthUser, familyId: string): Promise<void> {
  const familyIds = await resolveAccessibleFamilyIds(user)
  if (!familyIds.includes(familyId)) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Família não encontrada' })
  }
}

export async function resolveDoctorId(userId: string): Promise<string> {
  const doctor = await db.doctor.findUnique({ where: { userId } })
  if (!doctor) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Usuário não é um médico' })
  }
  return doctor.id
}

export async function resolveClinicId(userId: string): Promise<string> {
  const profile = await db.clinicAdminProfile.findUnique({ where: { userId } })
  if (!profile) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Usuário não é administrador de clínica' })
  }
  return profile.clinicId
}

/**
 * Gate de acesso clínico para DOCTOR/CLINIC_ADMIN: exige um MedicalAccessGrant
 * ACTIVE e não expirado casando memberId + doctorId/clinicId do requisitante.
 */
export async function assertActiveMedicalAccessGrant(params: {
  user: AuthUser
  memberId: string
}): Promise<{ grantId: string }> {
  const { user, memberId } = params
  const expiryFilter = { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }

  let grant: { id: string } | null = null

  if (user.role === 'DOCTOR') {
    const doctorId = await resolveDoctorId(user.id)
    grant = await db.medicalAccessGrant.findFirst({
      where: { memberId, doctorId, status: 'ACTIVE', ...expiryFilter },
      select: { id: true },
    })
  } else if (user.role === 'CLINIC_ADMIN') {
    const clinicId = await resolveClinicId(user.id)
    grant = await db.medicalAccessGrant.findFirst({
      where: { memberId, clinicId, status: 'ACTIVE', ...expiryFilter },
      select: { id: true },
    })
  } else {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Perfil não pode acessar prontuário de terceiros',
    })
  }

  if (!grant) {
    throw new AppError({
      code: 'MEDICAL_ACCESS_REQUIRED',
      message: 'Acesso ao prontuário deste paciente não foi concedido',
    })
  }

  return { grantId: grant.id }
}
