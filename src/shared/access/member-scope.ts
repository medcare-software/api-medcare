import type { Role } from '@prisma/client'

import { db } from '../../config/database.js'
import { AppError } from '../errors/index.js'
import type { AuthUser } from '../types/auth.types.js'

// Roles que acessam o prontuário através do pertencimento a uma Family
// (PATIENT_ADMIN/FAMILY_MEMBER via FamilyMember.userId, CAREGIVER via CaregiverAccess).
// Mesma conta pode ter FamilyMember E CaregiverAccess (modos distintos na UI).
const FAMILY_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']

const caregiverAccessWhere = (userId: string) => ({
  caregiverId: userId,
  status: 'ACTIVE' as const,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
})

export function isFamilyRole(role: Role): boolean {
  return FAMILY_ROLES.includes(role)
}

/** Famílias com CaregiverAccess ACTIVE do usuário (modo cuidador). */
export async function resolveCaregiverFamilyIds(userId: string): Promise<string[]> {
  const accesses = await db.caregiverAccess.findMany({
    where: caregiverAccessWhere(userId),
    select: { familyId: true },
  })
  return accesses.map((access) => access.familyId)
}

/**
 * Famílias acessíveis: FamilyMember (modo pessoal) ∪ CaregiverAccess (modo cuidador).
 * A UI não mistura os modos — o backend só precisa autorizar o vínculo correto.
 */
export async function resolveAccessibleFamilyIds(user: AuthUser): Promise<string[]> {
  if (!isFamilyRole(user.role)) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não tem acesso a registros familiares' })
  }

  const [member, caregiverFamilyIds] = await Promise.all([
    db.familyMember.findUnique({
      where: { userId: user.id },
      select: { familyId: true },
    }),
    resolveCaregiverFamilyIds(user.id),
  ])

  const ids = new Set<string>(caregiverFamilyIds)
  if (member) ids.add(member.familyId)
  return [...ids]
}

/**
 * Só a família do FamilyMember do usuário — gestão administrativa (convites,
 * criar/excluir membros) não pode usar famílias só via CaregiverAccess.
 */
export async function assertOwnFamilyInScope(user: AuthUser, familyId: string): Promise<void> {
  const member = await db.familyMember.findUnique({
    where: { userId: user.id },
    select: { familyId: true },
  })
  if (!member || member.familyId !== familyId) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Família não encontrada' })
  }
}

/**
 * Todos os FamilyMember.id que o usuário pode ler/escrever: a própria família
 * (PATIENT_ADMIN/FAMILY_MEMBER) ou as famílias com CaregiverAccess ACTIVE.
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

/** FamilyMember.id do próprio usuário (PATIENT_ADMIN/FAMILY_MEMBER). null para CAREGIVER e demais roles. */
export async function resolveOwnMemberId(user: AuthUser): Promise<string | null> {
  if (user.role !== 'PATIENT_ADMIN' && user.role !== 'FAMILY_MEMBER') {
    return null
  }
  const member = await db.familyMember.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  return member?.id ?? null
}

/**
 * Como resolveAccessibleMemberIds, mas FAMILY_MEMBER na própria família resolve
 * só para o próprio member. Em famílias via CaregiverAccess, vê/escreve o roster
 * completo (modo cuidador). PATIENT_ADMIN e CAREGIVER: famílias acessíveis inteiras.
 */
export async function resolveOwnScopedMemberIds(user: AuthUser): Promise<string[]> {
  if (user.role === 'FAMILY_MEMBER') {
    const [ownId, caregiverFamilyIds] = await Promise.all([
      resolveOwnMemberId(user),
      resolveCaregiverFamilyIds(user.id),
    ])
    const ids = new Set<string>()
    if (ownId) ids.add(ownId)
    if (caregiverFamilyIds.length > 0) {
      const members = await db.familyMember.findMany({
        where: { familyId: { in: caregiverFamilyIds }, deletedAt: null },
        select: { id: true },
      })
      for (const m of members) ids.add(m.id)
    }
    return [...ids]
  }
  return resolveAccessibleMemberIds(user)
}

/** Lança NOT_FOUND (nunca FORBIDDEN) — versão own-scoped de assertMemberInScope. */
export async function assertOwnScopedMemberInScope(
  user: AuthUser,
  memberId: string,
): Promise<void> {
  const memberIds = await resolveOwnScopedMemberIds(user)
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
}): Promise<{ grantId: string; doctorId: string | null }> {
  const { user, memberId } = params
  const expiryFilter = { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }

  let grant: { id: string; doctorId: string | null } | null = null

  if (user.role === 'DOCTOR') {
    const doctorId = await resolveDoctorId(user.id)
    grant = await db.medicalAccessGrant.findFirst({
      where: { memberId, doctorId, status: 'ACTIVE', ...expiryFilter },
      select: { id: true, doctorId: true },
    })
  } else if (user.role === 'CLINIC_ADMIN') {
    const clinicId = await resolveClinicId(user.id)
    grant = await db.medicalAccessGrant.findFirst({
      where: { memberId, clinicId, status: 'ACTIVE', ...expiryFilter },
      select: { id: true, doctorId: true },
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

  // "Última visita" na tela de acessos da clínica vem daqui — único ponto de
  // gate para todo módulo clínico (medications/vaccines/exams/diagnostics/procedures/files).
  await db.medicalAccessGrant.update({
    where: { id: grant.id },
    data: { lastAccessedAt: new Date() },
  })

  return { grantId: grant.id, doctorId: grant.doctorId }
}

/**
 * Médico autor do registro clínico: DOCTOR = próprio perfil; CLINIC_ADMIN = médico
 * vinculado ao grant ativo do paciente (selecionado no resgate do código).
 */
export async function resolveClinicalAuthorDoctorId(
  user: AuthUser,
  memberId: string,
): Promise<string> {
  if (user.role === 'DOCTOR') {
    return resolveDoctorId(user.id)
  }
  if (user.role === 'CLINIC_ADMIN') {
    const { doctorId } = await assertActiveMedicalAccessGrant({ user, memberId })
    if (!doctorId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message:
          'Selecione o médico responsável no acesso ao paciente antes de registrar este dado',
      })
    }
    return doctorId
  }
  throw new AppError({
    code: 'FORBIDDEN',
    message: 'Apenas médicos ou clínicas com acesso podem registrar este dado clínico',
  })
}
