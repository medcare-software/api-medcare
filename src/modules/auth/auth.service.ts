import bcrypt from 'bcryptjs'

import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors/index.js'
import { hashForLookup } from '../../shared/security/index.js'
import { parseDurationToMs } from '../../shared/utils/index.js'
import { authRepository } from './auth.repository.js'
import type { CrmLoginInput, EmailLoginInput } from './auth.schema.js'

export const authService = {
  // ── Login ──────────────────────────────────────────────────────────────────

  async validateEmailLogin(input: EmailLoginInput) {
    const user = await authRepository.findUserByEmail(input.email)
    return assertCredentials(user, input.password)
  },

  async validateCrmLogin(input: CrmLoginInput) {
    const user = await authRepository.findUserByCrm(input.crmNumber, input.crmState)
    return assertCredentials(user, input.password)
  },

  // ── Sessão / Refresh Token ─────────────────────────────────────────────────

  async storeRefreshToken(userId: string, jti: string, refreshToken: string) {
    const expiresAt = new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN))
    const tokenHash = hashForLookup(refreshToken)
    await authRepository.createRefreshToken({ userId, jti, tokenHash, expiresAt })
  },

  async validateAndRotateSession(jti: string) {
    const record = await authRepository.findRefreshTokenByJti(jti)

    if (!record || record.revoked) {
      throw new AppError({ code: 'TOKEN_REVOKED', message: 'Refresh token foi revogado' })
    }
    if (record.expiresAt < new Date()) {
      throw new AppError({ code: 'TOKEN_EXPIRED', message: 'Refresh token expirado' })
    }

    const user = await authRepository.findUserById(record.userId)
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError({ code: 'UNAUTHORIZED', message: 'Conta inativa ou inexistente' })
    }

    await authRepository.revokeRefreshToken(jti)
    return user
  },

  async revokeSession(jti: string) {
    const record = await authRepository.findRefreshTokenByJti(jti)
    if (record && !record.revoked) {
      await authRepository.revokeRefreshToken(jti)
    }
  },

  async me(userId: string) {
    const user = await authRepository.findUserById(userId)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' })
    }
    return user
  },
}

async function assertCredentials<T extends { passwordHash: string; status: string } | null>(
  user: T,
  password: string,
) {
  if (!user || user.status !== 'ACTIVE') {
    throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' })
  }
  const matches = await bcrypt.compare(password, user.passwordHash)
  if (!matches) {
    throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' })
  }
  return user
}
