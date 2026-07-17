import type { Role, UserStatus } from '@prisma/client'

import { db } from '../../config/database.js'

// Roles que representam usuários finais do app-medcare — clínicas e médicos já
// têm telas/módulos próprios (clinics, doctors) e não entram aqui.
export const APP_USER_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']

type UserListFilters = {
  role?: Role
  status?: UserStatus
  search?: string
  isFamilyAdmin?: boolean
}

function buildUserWhere(filters: UserListFilters) {
  return {
    deletedAt: null,
    role: { in: filters.role ? [filters.role] : APP_USER_ROLES },
    ...(filters.status && { status: filters.status }),
    ...(filters.isFamilyAdmin !== undefined && {
      familyMember: { isAdmin: filters.isFamilyAdmin },
    }),
    ...(filters.search && {
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' as const } },
        { email: { contains: filters.search, mode: 'insensitive' as const } },
      ],
    }),
  }
}

export const usersRepository = {
  findMany(filters: UserListFilters, pagination: { skip: number; take: number }) {
    return db.user.findMany({
      where: buildUserWhere(filters),
      include: {
        familyMember: { select: { id: true, familyId: true, birthDate: true, isAdmin: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  count(filters: UserListFilters) {
    return db.user.count({ where: buildUserWhere(filters) })
  },

  findById(id: string) {
    return db.user.findFirst({
      where: { id, deletedAt: null, role: { in: APP_USER_ROLES } },
      include: {
        familyMember: { include: { healthProfile: true } },
      },
    })
  },

  // Demais membros da mesma família (exclui o próprio usuário) — usado no
  // detalhe do usuário admin para listar quem mais está na família.
  findOtherFamilyMembers(familyId: string, excludeMemberId: string) {
    return db.familyMember.findMany({
      where: { familyId, deletedAt: null, id: { not: excludeMemberId } },
      orderBy: { createdAt: 'asc' },
    })
  },

  countFamilyMembers(familyId: string, excludeMemberId: string) {
    return db.familyMember.count({
      where: { familyId, deletedAt: null, id: { not: excludeMemberId } },
    })
  },

  findMedicationsByMember(memberId: string) {
    return db.medication.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' } })
  },

  updatePasswordHash(userId: string, passwordHash: string) {
    return db.user.update({ where: { id: userId }, data: { passwordHash } })
  },

  // KPIs do topo da tela — baseados em FamilyMember (pessoas gerenciadas no
  // app), não em User, porque um membro sem login próprio (ex.: filho menor)
  // ainda conta como pessoa cadastrada.
  countFamilyMembersByAdminFlag(isAdmin: boolean, createdAfter?: Date) {
    return db.familyMember.count({
      where: {
        deletedAt: null,
        isAdmin,
        ...(createdAfter && { createdAt: { gte: createdAfter } }),
      },
    })
  },

  countAllFamilyMembers(createdAfter?: Date) {
    return db.familyMember.count({
      where: { deletedAt: null, ...(createdAfter && { createdAt: { gte: createdAfter } }) },
    })
  },
}
