import bcrypt from 'bcryptjs'

import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors/index.js'
import { accountWelcomeTemplate, sendMail } from '../../shared/mail/index.js'
import {
  decryptField,
  generateTemporaryPassword,
  maskCpf,
  recordAuditEvent,
  recordSensitiveAccess,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { authRepository } from '../auth/auth.repository.js'
import { usersRepository } from './users.repository.js'
import type { ListUsersQuery } from './users.schema.js'

function maskedCpf(cpfEncrypted: Uint8Array | null) {
  return cpfEncrypted ? maskCpf(decryptField(cpfEncrypted)) : null
}

function toUserSummary(user: Awaited<ReturnType<typeof usersRepository.findMany>>[number]) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    cpf: maskedCpf(user.cpfEncrypted),
    phone: user.phone,
    state: user.state,
    role: user.role,
    status: user.status,
    isFamilyAdmin: user.familyMember?.isAdmin ?? false,
    birthDate: user.familyMember?.birthDate ?? null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }
}

export const usersService = {
  async list(query: ListUsersQuery) {
    const filters = {
      ...(query.role && { role: query.role }),
      ...(query.status && { status: query.status }),
      ...(query.search && { search: query.search }),
      ...(query.isFamilyAdmin !== undefined && { isFamilyAdmin: query.isFamilyAdmin }),
      ...(query.registeredFrom && { registeredFrom: query.registeredFrom }),
      ...(query.registeredTo && { registeredTo: query.registeredTo }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [users, total] = await Promise.all([
      usersRepository.findMany(filters, pagination),
      usersRepository.count(filters),
    ])

    const membersCounts = await Promise.all(
      users.map((user) =>
        user.familyMember?.isAdmin
          ? usersRepository.countFamilyMembers(user.familyMember.familyId, user.familyMember.id)
          : Promise.resolve(null),
      ),
    )

    const items = users.map((user, index) => ({
      ...toUserSummary(user),
      membersCount: membersCounts[index],
    }))
    return { items, total }
  },

  async getKpis() {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [
      totalUsers,
      totalUsersThisMonth,
      familyAdmins,
      familyAdminsThisMonth,
      familyMembers,
      familyMembersThisMonth,
    ] = await Promise.all([
      usersRepository.countAllFamilyMembers(),
      usersRepository.countAllFamilyMembers(startOfMonth),
      usersRepository.countFamilyMembersByAdminFlag(true),
      usersRepository.countFamilyMembersByAdminFlag(true, startOfMonth),
      usersRepository.countFamilyMembersByAdminFlag(false),
      usersRepository.countFamilyMembersByAdminFlag(false, startOfMonth),
    ])

    return {
      totalUsers: { value: totalUsers, changeThisMonth: totalUsersThisMonth },
      familyAdmins: { value: familyAdmins, changeThisMonth: familyAdminsThisMonth },
      familyMembers: { value: familyMembers, changeThisMonth: familyMembersThisMonth },
    }
  },

  async getById(actor: AuthUser, id: string) {
    const user = await usersRepository.findById(id)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' })
    }

    const familyMember = user.familyMember
    const [otherMembers, medications] = await Promise.all([
      familyMember
        ? usersRepository.findOtherFamilyMembers(familyMember.familyId, familyMember.id)
        : Promise.resolve([]),
      familyMember ? usersRepository.findMedicationsByMember(familyMember.id) : Promise.resolve([]),
    ])

    if (familyMember?.healthProfile) {
      await recordSensitiveAccess({
        actorId: actor.id,
        action: 'VIEW_CLINICAL_NOTES',
        targetType: 'HealthProfile',
        targetId: familyMember.healthProfile.id,
      })
    }

    return {
      ...toUserSummary(user),
      membersCount: familyMember?.isAdmin ? otherMembers.length : null,
      familyMembers: otherMembers.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        relationship: member.relationship,
        birthDate: member.birthDate,
      })),
      healthProfile: familyMember?.healthProfile
        ? {
            weightKg: familyMember.healthProfile.weightKg,
            heightM: familyMember.healthProfile.heightM,
            bloodType: familyMember.healthProfile.bloodType,
            conditions: familyMember.healthProfile.conditions,
            allergies: familyMember.healthProfile.allergies,
            clinicalNotes: familyMember.healthProfile.notesEncrypted
              ? decryptField(familyMember.healthProfile.notesEncrypted)
              : null,
          }
        : null,
      medications: medications.map((medication) => ({
        id: medication.id,
        name: medication.name,
        dosage: medication.dosage,
        dosageUnit: medication.dosageUnit,
        form: medication.form,
        frequency: medication.frequency,
        stripeColor: medication.stripeColor,
        continuousUse: medication.continuousUse,
        active: medication.active,
      })),
    }
  },

  async forceResetPassword(actor: AuthUser, id: string) {
    const user = await usersRepository.findById(id)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' })
    }

    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS)
    await usersRepository.updatePasswordHash(user.id, passwordHash)
    await authRepository.revokeAllUserRefreshTokens(user.id)

    try {
      const template = accountWelcomeTemplate(user.name, temporaryPassword)
      await sendMail({ to: user.email, ...template })
    } catch (err) {
      console.error(`[users] Falha ao enviar e-mail de redefinição para ${user.email}`, err)
    }

    await recordAuditEvent({
      actorId: actor.id,
      action: 'FORCE_RESET_PASSWORD',
      targetType: 'User',
      targetId: user.id,
    })
  },
}
