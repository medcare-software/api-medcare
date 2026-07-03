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

  async findUserById(id: string) {
    return db.user.findFirst({ where: { id, deletedAt: null }, include: { doctor: true } })
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
}
