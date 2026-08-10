import { db } from '../../config/database.js'

export const authRepository = {
  async findUserByEmail(email: string) {
    return db.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: {
        doctor: true,
        clinicAdminProfile: true,
        familyMember: { select: { id: true, familyId: true, isAdmin: true } },
      },
    })
  },

  async findUserByCrm(crmNumber: string, crmState: string) {
    return db.user.findFirst({
      where: { deletedAt: null, doctor: { crmNumber, crmState: crmState.toUpperCase() } },
      include: { doctor: true },
    })
  },

  async findUserByCpfHash(cpfHash: string) {
    return db.user.findFirst({
      where: { cpfHash, deletedAt: null },
      include: {
        doctor: true,
        clinicAdminProfile: true,
        familyMember: { select: { id: true, familyId: true, isAdmin: true } },
      },
    })
  },

  // Login da clínica por CNPJ (web-medcare) — Clinic guarda o cnpjHash, não User/
  // ClinicAdminProfile, então a resolução passa por Clinic → ClinicAdminProfile → User.
  async findClinicAdminByCnpjHash(cnpjHash: string) {
    const clinic = await db.clinic.findFirst({ where: { cnpjHash, deletedAt: null } })
    if (!clinic) return null
    return db.user.findFirst({
      where: { deletedAt: null, clinicAdminProfile: { clinicId: clinic.id } },
      include: { doctor: true, clinicAdminProfile: true },
    })
  },

  async findUserById(id: string) {
    return db.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        doctor: true,
        // Só o suficiente pra o client saber o próprio memberId (necessário pra
        // completar o registro com o health-profile) — nunca o registro inteiro aqui.
        familyMember: {
          select: {
            id: true,
            familyId: true,
            isAdmin: true,
            birthDate: true,
            biologicalSex: true,
            cpfHash: true,
            family: { select: { name: true } },
            healthProfile: {
              select: { weightKg: true, heightM: true, bloodType: true },
            },
          },
        },
      },
    })
  },

  async createRefreshToken(data: {
    userId: string
    jti: string
    tokenHash: string
    expiresAt: Date
    deviceLabel?: string
  }) {
    return db.refreshToken.create({ data })
  },

  async findRefreshTokenByJti(jti: string) {
    return db.refreshToken.findUnique({ where: { jti } })
  },

  // Usado pelo limite de 2 sessões simultâneas (só médico, ver enforceSessionCapacity).
  async countActiveRefreshTokens(userId: string) {
    return db.refreshToken.count({
      where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    })
  },

  // A sessão mais antiga ainda ativa — usada pra liberar espaço automaticamente
  // quando o limite é atingido (ver enforceSessionCapacity).
  async findOldestActiveRefreshToken(userId: string) {
    return db.refreshToken.findFirst({
      where: { userId, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    })
  },

  async revokeRefreshToken(jti: string) {
    await db.refreshToken.update({ where: { jti }, data: { revoked: true, revokedAt: new Date() } })
  },

  async revokeAllUserRefreshTokens(userId: string) {
    await db.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    })
  },

  async updatePassword(userId: string, passwordHash: string) {
    await db.user.update({ where: { id: userId }, data: { passwordHash } })
  },

  async updateLastLogin(userId: string) {
    await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
  },

  async countRecentPasswordResetRequests(userId: string, since: Date) {
    return db.passwordResetToken.count({ where: { userId, createdAt: { gte: since } } })
  },

  async createPasswordResetToken(data: { userId: string; codeHash: string; expiresAt: Date }) {
    return db.passwordResetToken.create({ data })
  },

  async findActivePasswordResetToken(userId: string) {
    return db.passwordResetToken.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  },

  async incrementPasswordResetAttempts(id: string) {
    await db.passwordResetToken.update({ where: { id }, data: { attempts: { increment: 1 } } })
  },

  async consumePasswordResetToken(id: string) {
    await db.passwordResetToken.update({ where: { id }, data: { consumedAt: new Date() } })
  },

  async acceptProfessionalTerms(
    userId: string,
    data: {
      professionalCommitmentAcceptedAt: Date
      professionalSecurityPolicyAcceptedAt: Date
      professionalTermsVersion: string
      termsOfUseAcceptedAt: Date
      privacyPolicyAcceptedAt: Date
      consumerTermsVersion: string
    },
  ) {
    return db.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        professionalCommitmentAcceptedAt: true,
        professionalSecurityPolicyAcceptedAt: true,
        professionalTermsVersion: true,
        termsOfUseAcceptedAt: true,
        privacyPolicyAcceptedAt: true,
        consumerTermsVersion: true,
      },
    })
  },

  // Soft-delete de User do app. Se ainda é prestador (Doctor/ClinicAdmin), só
  // revoga sessões — o portal web continua com o mesmo e-mail.
  async softDeleteAppUser(userId: string) {
    const now = new Date()
    return db.$transaction(async (tx) => {
      const linked = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: {
          doctor: { select: { id: true } },
          clinicAdminProfile: { select: { id: true } },
        },
      })
      if (!linked) return

      const isProvider =
        !!linked.doctor ||
        !!linked.clinicAdminProfile ||
        linked.role === 'DOCTOR' ||
        linked.role === 'CLINIC_ADMIN'

      if (isProvider) {
        await tx.refreshToken.updateMany({
          where: { userId, revoked: false },
          data: { revoked: true, revokedAt: now },
        })
        return
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          status: 'INACTIVE',
          email: `deleted+${userId}.${now.getTime()}@deleted.local`,
          cpfHash: null,
        },
      })
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: now },
      })
    })
  },

  async revokeFamilyCaregiverLinks(familyId: string) {
    const now = new Date()
    await db.$transaction([
      db.caregiverInvite.updateMany({
        where: { familyId, status: { not: 'REVOKED' } },
        data: { status: 'REVOKED', revokedAt: now },
      }),
      db.caregiverAccess.updateMany({
        where: { familyId, status: { not: 'REVOKED' } },
        data: { status: 'REVOKED', revokedAt: now },
      }),
    ])
  },

  async revokeCaregiverAccessesByUser(caregiverId: string) {
    const now = new Date()
    await db.caregiverAccess.updateMany({
      where: { caregiverId, status: { not: 'REVOKED' } },
      data: { status: 'REVOKED', revokedAt: now },
    })
  },
}
