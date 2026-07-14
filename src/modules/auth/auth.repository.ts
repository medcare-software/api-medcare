import { db } from '../../config/database.js'

export const authRepository = {
  async findUserByEmail(email: string) {
    return db.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: { doctor: true },
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
      include: { doctor: true },
    })
  },

  // Login da clínica por CNPJ (web-medcare) — Clinic guarda o cnpjHash, não User/
  // ClinicAdminProfile, então a resolução passa por Clinic → ClinicAdminProfile → User.
  async findClinicAdminByCnpjHash(cnpjHash: string) {
    const clinic = await db.clinic.findFirst({ where: { cnpjHash, deletedAt: null } })
    if (!clinic) return null
    return db.user.findFirst({
      where: { deletedAt: null, clinicAdminProfile: { clinicId: clinic.id } },
      include: { doctor: true },
    })
  },

  async findUserById(id: string) {
    return db.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        doctor: true,
        // Só o suficiente pra o client saber o próprio memberId (necessário pra
        // completar o registro com o health-profile) — nunca o registro inteiro aqui.
        familyMember: { select: { id: true, familyId: true, isAdmin: true } },
      },
    })
  },

  async createRefreshToken(data: {
    userId: string
    jti: string
    tokenHash: string
    expiresAt: Date
  }) {
    return db.refreshToken.create({ data })
  },

  async findRefreshTokenByJti(jti: string) {
    return db.refreshToken.findUnique({ where: { jti } })
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
}
