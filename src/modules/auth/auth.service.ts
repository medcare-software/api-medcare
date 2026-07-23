import crypto from 'node:crypto'

import type { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors/index.js'
import { passwordResetCodeTemplate, sendMail } from '../../shared/mail/index.js'
import { hashForLookup, onlyDigits, recordAuditEvent } from '../../shared/security/index.js'
import type { PasswordResetSessionPayload } from '../../shared/types/auth.types.js'
import { parseDurationToMs } from '../../shared/utils/index.js'
import { authRepository } from './auth.repository.js'
import type { CrmLoginInput, EmailLoginInput, IdentifierLoginInput } from './auth.schema.js'

const MAX_RESET_CODE_ATTEMPTS = 5

// Reutilizado tanto pelo fluxo de "esqueci a senha" (após verificar o código)
// quanto pela ativação de conta de membro familiar (link de e-mail) — mesmo
// JWT de propósito único, só muda quem emite e o TTL.
export function issuePasswordResetSessionToken(
  fastify: FastifyInstance,
  userId: string,
  expiresIn: string,
): string {
  const payload: Omit<PasswordResetSessionPayload, 'iat' | 'exp'> = {
    sub: userId,
    purpose: 'password_reset',
  }
  return fastify.jwt.sign(payload, { expiresIn })
}

export const authService = {
  // ── Login ──────────────────────────────────────────────────────────────────

  async validateEmailLogin(input: EmailLoginInput) {
    const user = await authRepository.findUserByEmail(input.email)
    return assertCredentials(user, input.password)
  },

  // app-medcare (CPF ou e-mail) e clínica/web-medcare (e-mail ou CNPJ) num único
  // campo — decide pelo formato do valor (CPF tem 11 dígitos, CNPJ tem 14).
  //
  // Uma mesma pessoa pode acumular um papel do app-medcare (PATIENT_ADMIN/
  // FAMILY_MEMBER/CAREGIVER) com um papel do web-medcare (CLINIC_ADMIN/DOCTOR),
  // já que User.email é único mas as tabelas de perfil (Doctor/ClinicAdminProfile)
  // são relações independentes — ver clinics.service.ts/doctors.service.ts. Login
  // por CNPJ já é inequívoco (só resolve via ClinicAdminProfile); login por CRM
  // (validateCrmLogin) idem. Só o login por e-mail/CPF é ambíguo nesse cenário,
  // por isso o `portal` informado pela tela de login decide qual vínculo exigir
  // em vez de confiar cegamente em User.role (que só guarda 1 valor).
  async validateIdentifierLogin(input: IdentifierLoginInput) {
    const isEmail = input.identifier.includes('@')
    const digits = onlyDigits(input.identifier)

    if (!isEmail && digits.length === 14) {
      const user = await authRepository.findClinicAdminByCnpjHash(hashForLookup(digits))
      const verifiedUser = await assertCredentials(user, input.password)
      return { ...verifiedUser, role: 'CLINIC_ADMIN' as const }
    }

    const user = isEmail
      ? await authRepository.findUserByEmail(input.identifier)
      : await authRepository.findUserByCpfHash(hashForLookup(digits))
    const verifiedUser = await assertCredentials(user, input.password)

    if (input.portal === 'clinic') {
      if (!verifiedUser.clinicAdminProfile) {
        throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' })
      }
      return { ...verifiedUser, role: 'CLINIC_ADMIN' as const }
    }

    if (input.portal === 'admin') {
      if (verifiedUser.role !== 'PLATFORM_ADMIN') {
        throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' })
      }
      return verifiedUser
    }

    if (input.portal === 'app') {
      const appRoles: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']
      if (!appRoles.includes(verifiedUser.role)) {
        throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' })
      }
      return verifiedUser
    }

    // `portal` omitido — compatibilidade retroativa, comportamento anterior.
    return verifiedUser
  },

  async validateCrmLogin(input: CrmLoginInput) {
    const user = await authRepository.findUserByCrm(input.crmNumber, input.crmState)
    const verifiedUser = await assertCredentials(user, input.password)
    return { ...verifiedUser, role: 'DOCTOR' as const }
  },

  // ── Sessão / Refresh Token ─────────────────────────────────────────────────

  async storeRefreshToken(userId: string, jti: string, refreshToken: string, deviceLabel?: string) {
    const expiresAt = new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN))
    const tokenHash = hashForLookup(refreshToken)
    await authRepository.createRefreshToken({
      userId,
      jti,
      tokenHash,
      expiresAt,
      ...(deviceLabel !== undefined && { deviceLabel }),
    })
  },

  // Limite de 2 sessões simultâneas só pra login de médico (clínica/família não
  // são afetados). Em vez de bloquear o login, libera espaço revogando a sessão
  // mais antiga — sessões ficam "presas" ativas no servidor sempre que o médico
  // fecha a aba/navegador sem clicar em "Sair" (o browser não tem como avisar o
  // backend nesse caso), então bloquear pra sempre exigiria intervenção manual
  // toda vez que isso acontecesse.
  async enforceSessionCapacity(userId: string, role: Role) {
    if (role !== 'DOCTOR') return
    const activeCount = await authRepository.countActiveRefreshTokens(userId)
    if (activeCount < 2) return
    const oldest = await authRepository.findOldestActiveRefreshToken(userId)
    if (oldest) {
      await authRepository.revokeRefreshToken(oldest.jti)
    }
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

  async recordLogin(userId: string) {
    await authRepository.updateLastLogin(userId)
    await recordAuditEvent({
      actorId: userId,
      action: 'LOGIN',
      targetType: 'User',
      targetId: userId,
    })
  },

  async me(userId: string) {
    const user = await authRepository.findUserById(userId)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' })
    }
    return user
  },

  // ── Esqueci a senha ────────────────────────────────────────────────────────

  // Decisão de produto: valida se o e-mail existe (em vez de resposta genérica) —
  // ver documento de arquitetura, seção 1.4 item 5. Mitigado com rate limit por
  // e-mail (PASSWORD_RESET_MAX_REQUESTS_PER_HOUR) além do limite global por IP.
  async requestPasswordReset(email: string): Promise<void> {
    const user = await authRepository.findUserByEmail(email)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'E-mail não cadastrado' })
    }

    const since = new Date(Date.now() - 60 * 60_000)
    const recentRequests = await authRepository.countRecentPasswordResetRequests(user.id, since)
    if (recentRequests >= env.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR) {
      throw new AppError({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas solicitações. Tente novamente mais tarde.',
      })
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const codeHash = hashForLookup(code)
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_CODE_TTL_MINUTES * 60_000)
    await authRepository.createPasswordResetToken({ userId: user.id, codeHash, expiresAt })

    const template = passwordResetCodeTemplate(code, env.PASSWORD_RESET_CODE_TTL_MINUTES)
    await sendMail({ to: user.email, ...template })
  },

  async verifyResetCode(
    fastify: FastifyInstance,
    email: string,
    code: string,
  ): Promise<{ resetSessionToken: string }> {
    const user = await authRepository.findUserByEmail(email)
    if (!user) {
      throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
    }

    const token = await authRepository.findActivePasswordResetToken(user.id)
    if (!token) {
      throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
    }
    if (token.expiresAt < new Date() || token.attempts >= MAX_RESET_CODE_ATTEMPTS) {
      throw new AppError({ code: 'ACCESS_CODE_EXPIRED', message: 'Código expirado' })
    }

    if (token.codeHash !== hashForLookup(code)) {
      await authRepository.incrementPasswordResetAttempts(token.id)
      throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
    }

    await authRepository.consumePasswordResetToken(token.id)

    const resetSessionToken = issuePasswordResetSessionToken(
      fastify,
      user.id,
      env.PASSWORD_RESET_SESSION_EXPIRES_IN,
    )
    return { resetSessionToken }
  },

  async resetPassword(
    fastify: FastifyInstance,
    resetSessionToken: string,
    newPassword: string,
  ): Promise<void> {
    let payload: PasswordResetSessionPayload
    try {
      payload = fastify.jwt.verify<PasswordResetSessionPayload>(resetSessionToken)
    } catch {
      throw new AppError({
        code: 'TOKEN_INVALID',
        message: 'Sessão de redefinição inválida ou expirada',
      })
    }
    if (payload.purpose !== 'password_reset') {
      throw new AppError({ code: 'TOKEN_INVALID', message: 'Sessão de redefinição inválida' })
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS)
    await authRepository.updatePassword(payload.sub, passwordHash)
    // Troca de senha derruba todas as sessões ativas — força novo login em todo dispositivo.
    await authRepository.revokeAllUserRefreshTokens(payload.sub)
  },

  // Checagem sem efeito colateral (não consome/revoga nada) — usada pela página
  // https intermediária antes de mostrar a UI de "definir senha" pra um token
  // que pode ter vindo de qualquer lugar, não só de um e-mail real emitido por nós.
  validateResetSessionToken(fastify: FastifyInstance, token: string): boolean {
    try {
      const payload = fastify.jwt.verify<PasswordResetSessionPayload>(token)
      return payload.purpose === 'password_reset'
    } catch {
      return false
    }
  },

  // Troca de senha por quem já está logado (diferente do fluxo de esqueci-senha,
  // que não exige saber a senha atual). Mesmo racional do resetPassword: derruba
  // todas as sessões ativas.
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await authRepository.findUserById(userId)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' })
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!matches) {
      throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Senha atual incorreta' })
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS)
    await authRepository.updatePassword(userId, passwordHash)
    await authRepository.revokeAllUserRefreshTokens(userId)
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
