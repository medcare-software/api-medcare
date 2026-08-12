import crypto from 'node:crypto'

import type { Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'

import { env } from '../../config/env.js'
import { redis } from '../../config/redis.js'
import { AppError } from '../../shared/errors/index.js'
import { passwordResetCodeTemplate, sendMail } from '../../shared/mail/index.js'
import { hashForLookup, onlyDigits, recordAuditEvent } from '../../shared/security/index.js'
import type {
  PasswordResetDestination,
  PasswordResetSessionPayload,
} from '../../shared/types/auth.types.js'
import { parseDurationToMs } from '../../shared/utils/index.js'
import { auditLogsRepository } from '../audit-logs/audit-logs.repository.js'
import { resolveDoctorSessionLimitByUserId } from '../doctors/doctor-session-limit.js'
import { familiesRepository } from '../families/families.repository.js'
import { medicalAccessRepository } from '../medical-access/medical-access.repository.js'
import { authRepository } from './auth.repository.js'
import type { CrmLoginInput, EmailLoginInput, IdentifierLoginInput } from './auth.schema.js'
import { CONSUMER_TERMS_VERSION } from '../legal/legal.service.js'
import { PROFESSIONAL_TERMS_VERSION } from './auth.schema.js'

const APP_DELETE_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']

const MAX_RESET_CODE_ATTEMPTS = 5
const LOGIN_AUDIT_THROTTLE_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_LINK_PREFIX = 'pwdreset:'

// Reutilizado tanto pelo fluxo de "esqueci a senha" (após verificar o código)
// quanto pela ativação de conta (link de e-mail) — mesmo JWT de propósito único,
// só muda quem emite, o TTL e o `destination` (roteamento LP/portal).
export function issuePasswordResetSessionToken(
  fastify: FastifyInstance,
  userId: string,
  expiresIn: string,
  destination?: PasswordResetDestination,
): string {
  const payload: Omit<PasswordResetSessionPayload, 'iat' | 'exp'> = {
    sub: userId,
    purpose: 'password_reset',
    ...(destination !== undefined && { destination }),
  }
  return fastify.jwt.sign(payload, { expiresIn })
}

/**
 * Token curto pra URL de e-mail (Redis → JWT). JWT inteiro no link costuma ser
 * filtrado por Gmail/provedores como phishing; o OTP de 6 dígitos não tem esse
 * problema. Se Redis falhar, devolve o JWT (fallback).
 */
export async function issuePasswordResetLinkToken(
  fastify: FastifyInstance,
  userId: string,
  expiresIn: string,
  destination?: PasswordResetDestination,
): Promise<string> {
  const jwt = issuePasswordResetSessionToken(fastify, userId, expiresIn, destination)
  const linkToken = nanoid(24)
  const ttlSec = Math.max(60, Math.ceil(parseDurationToMs(expiresIn) / 1000))
  try {
    await redis.set(`${PASSWORD_RESET_LINK_PREFIX}${linkToken}`, jwt, 'EX', ttlSec)
    return linkToken
  } catch (err) {
    console.error(
      '[auth] Redis indisponível pra token curto de ativação — fallback JWT na URL',
      err,
    )
    return jwt
  }
}

/** Aceita JWT (3 partes) ou id curto guardado no Redis. */
export async function resolvePasswordResetSessionToken(token: string): Promise<string> {
  if (token.split('.').length === 3) return token
  try {
    const jwt = await redis.get(`${PASSWORD_RESET_LINK_PREFIX}${token}`)
    if (jwt) return jwt
  } catch (err) {
    console.error('[auth] Redis indisponível ao resolver token de reset', err)
  }
  throw new AppError({
    code: 'TOKEN_INVALID',
    message: 'Sessão de redefinição inválida ou expirada',
  })
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
      // Só entra no app quem tem FamilyMember — prestador só no web não passa.
      // Cuidador não é um login separado: qualquer conta familiar pode abrir o
      // "Modo cuidador" e resgatar códigos (CaregiverAccess).
      // Sessão usa papel de app derivado do vínculo (nunca DOCTOR/CLINIC_ADMIN).
      if (!verifiedUser.familyMember) {
        throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' })
      }
      const appRole: Role = verifiedUser.familyMember.isAdmin
        ? 'PATIENT_ADMIN'
        : 'FAMILY_MEMBER'
      return { ...verifiedUser, role: appRole }
    }

    // `portal` omitido — compatibilidade retroativa, comportamento anterior.
    return verifiedUser
  },

  async validateCrmLogin(input: CrmLoginInput) {
    const user = await authRepository.findUserByCrm(input.crmNumber, input.crmState)
    const verifiedUser = await assertCredentials(user, input.password)
    if (!verifiedUser.doctor) {
      throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Credenciais inválidas' })
    }
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

  // Limite de sessões simultâneas só pra login de médico (clínica/família não
  // são afetados) — vem de `Plan.devicesPerDoctor`. Em vez de bloquear o login,
  // libera espaço revogando as sessões mais antigas — sessões ficam "presas"
  // ativas no servidor sempre que o médico fecha a aba/navegador sem clicar em
  // "Sair" (o browser não tem como avisar o backend nesse caso).
  async enforceSessionCapacity(userId: string, role: Role) {
    if (role !== 'DOCTOR') return
    const limit = await resolveDoctorSessionLimitByUserId(userId)
    let activeCount = await authRepository.countActiveRefreshTokens(userId)
    while (activeCount >= limit) {
      const oldest = await authRepository.findOldestActiveRefreshToken(userId)
      if (!oldest) break
      await authRepository.revokeRefreshToken(oldest.jti)
      activeCount -= 1
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

    // lastLoginAt passa a refletir uso real do app (não só login por credencial)
    // — sessões longas via refresh token não devem aparecer como "inativas" nos
    // relatórios de churn. O AuditLog LOGIN, por outro lado, é gravado com
    // throttle de 24h aqui: cada refresh não gera um evento novo, só o primeiro
    // do dia — dá granularidade diária pro histórico (gráfico de evolução de
    // inatividade) sem inundar a tabela com um registro a cada renovação de token.
    await authRepository.updateLastLogin(user.id)
    const lastLoginAudit = await auditLogsRepository.findLatestByActorAndAction(user.id, 'LOGIN')
    if (
      !lastLoginAudit ||
      Date.now() - lastLoginAudit.createdAt.getTime() > LOGIN_AUDIT_THROTTLE_MS
    ) {
      await recordAuditEvent({
        actorId: user.id,
        action: 'LOGIN',
        targetType: 'User',
        targetId: user.id,
      })
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
    // Só o código mais recente vale — evita "código inválido" ao usar e-mail antigo
    // depois de tocar em Reenviar.
    await authRepository.invalidateOpenPasswordResetTokens(user.id)
    await authRepository.createPasswordResetToken({ userId: user.id, codeHash, expiresAt })

    const template = passwordResetCodeTemplate(code, env.PASSWORD_RESET_CODE_TTL_MINUTES)
    await sendMail({ to: user.email, ...template })
  },

  async verifyResetCode(
    fastify: FastifyInstance,
    email: string,
    code: string,
  ): Promise<{ resetSessionToken: string }> {
    const normalizedCode = onlyDigits(code)
    const user = await authRepository.findUserByEmail(email)
    if (!user || normalizedCode.length !== 6) {
      throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
    }

    const codeHash = hashForLookup(normalizedCode)
    const token = await authRepository.findActivePasswordResetToken(user.id)

    if (token) {
      if (token.expiresAt < new Date() || token.attempts >= MAX_RESET_CODE_ATTEMPTS) {
        throw new AppError({ code: 'ACCESS_CODE_EXPIRED', message: 'Código expirado' })
      }

      if (token.codeHash !== codeHash) {
        await authRepository.incrementPasswordResetAttempts(token.id)
        throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
      }

      await authRepository.consumePasswordResetToken(token.id)
    } else {
      // Sem token aberto: pode ser retry depois que o verify já consumiu o código
      // (app perdeu o 200). Reemite sessão se o consumo foi recente.
      const recentlyConsumed = await authRepository.findRecentlyConsumedPasswordResetToken(
        user.id,
        codeHash,
        new Date(Date.now() - 2 * 60_000),
      )
      if (!recentlyConsumed) {
        throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
      }
    }

    const resetSessionToken = issuePasswordResetSessionToken(
      fastify,
      user.id,
      env.PASSWORD_RESET_SESSION_EXPIRES_IN,
      destinationFromUser(user),
    )
    return { resetSessionToken }
  },

  async resetPassword(
    fastify: FastifyInstance,
    resetSessionToken: string,
    newPassword: string,
  ): Promise<void> {
    const jwt = await resolvePasswordResetSessionToken(resetSessionToken)
    let payload: PasswordResetSessionPayload
    try {
      payload = fastify.jwt.verify<PasswordResetSessionPayload>(jwt)
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
  async validateResetSessionToken(
    fastify: FastifyInstance,
    token: string,
  ): Promise<{ valid: boolean; destination?: PasswordResetDestination }> {
    try {
      const jwt = await resolvePasswordResetSessionToken(token)
      const payload = fastify.jwt.verify<PasswordResetSessionPayload>(jwt)
      if (payload.purpose !== 'password_reset') return { valid: false }
      return {
        valid: true,
        ...(payload.destination !== undefined && { destination: payload.destination }),
      }
    } catch {
      return { valid: false }
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

  // Soft-delete da própria conta (app). PATIENT_ADMIN cascateia toda a família;
  // FAMILY_MEMBER e CAREGIVER só a si mesmos.
  async deleteAccount(userId: string, role: Role, password: string): Promise<void> {
    if (!APP_DELETE_ROLES.includes(role)) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Exclusão de conta disponível apenas no aplicativo',
      })
    }

    const user = await authRepository.findUserById(userId)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' })
    }

    const matches = await bcrypt.compare(password, user.passwordHash)
    if (!matches) {
      throw new AppError({ code: 'INVALID_CREDENTIALS', message: 'Senha incorreta' })
    }

    if (role === 'PATIENT_ADMIN') {
      const familyId = user.familyMember?.familyId
      if (familyId) {
        const members = await familiesRepository.findManyByFamilyId(familyId)
        const memberIds = members.map((m) => m.id)
        // Remove grants de médicos/clínicas antes do soft-delete dos members
        // (soft-delete não dispara onDelete Cascade).
        await medicalAccessRepository.deleteManyByMemberIds(memberIds)
        for (const member of members) {
          await familiesRepository.softDeleteMember(member.id, member.userId)
        }
        await authRepository.revokeFamilyCaregiverLinks(familyId)
      }
      // Garante soft-delete do User mesmo se não havia FamilyMember (edge case)
      // ou se softDeleteMember só revogou tokens (prestador multi-papel).
      await authRepository.softDeleteAppUser(userId)
      await recordAuditEvent({
        actorId: userId,
        action: 'DELETE_ACCOUNT',
        targetType: 'User',
        targetId: userId,
        metadata: { role, familyId: familyId ?? null, cascadeFamily: Boolean(familyId) },
      })
      return
    }

    if (role === 'FAMILY_MEMBER') {
      if (user.familyMember) {
        await medicalAccessRepository.deleteManyByMemberIds([user.familyMember.id])
        await familiesRepository.softDeleteMember(user.familyMember.id, userId)
      } else {
        await authRepository.softDeleteAppUser(userId)
      }
      await recordAuditEvent({
        actorId: userId,
        action: 'DELETE_ACCOUNT',
        targetType: 'User',
        targetId: userId,
        metadata: { role },
      })
      return
    }

    // CAREGIVER
    await authRepository.revokeCaregiverAccessesByUser(userId)
    await authRepository.softDeleteAppUser(userId)
    await recordAuditEvent({
      actorId: userId,
      action: 'DELETE_ACCOUNT',
      targetType: 'User',
      targetId: userId,
      metadata: { role },
    })
  },

  async acceptProfessionalTerms(userId: string, role: string) {
    if (role !== 'DOCTOR' && role !== 'CLINIC_ADMIN') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Aceite de termos profissionais disponível apenas para médico e clínica',
      })
    }

    const user = await authRepository.findUserById(userId)
    if (!user) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' })
    }

    const now = new Date()
    const updated = await authRepository.acceptProfessionalTerms(userId, {
      professionalCommitmentAcceptedAt: now,
      professionalSecurityPolicyAcceptedAt: now,
      professionalTermsVersion: PROFESSIONAL_TERMS_VERSION,
      termsOfUseAcceptedAt: now,
      privacyPolicyAcceptedAt: now,
      consumerTermsVersion: CONSUMER_TERMS_VERSION,
    })

    await recordAuditEvent({
      actorId: userId,
      action: 'ACCEPT_PROFESSIONAL_TERMS',
      targetType: 'User',
      targetId: userId,
      metadata: {
        professionalVersion: PROFESSIONAL_TERMS_VERSION,
        consumerVersion: CONSUMER_TERMS_VERSION,
        role,
      },
    })

    return updated
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

// Melhor esforço pro OTP de esqueci-senha: se a pessoa tem família no app, o
// código costuma ser do app; senão usa o perfil web. Fluxos de ativação passam
// destination explicitamente e não dependem disso.
function destinationFromUser(user: {
  role: Role
  doctor?: unknown
  clinicAdminProfile?: unknown
  familyMember?: unknown
}): PasswordResetDestination | undefined {
  if (user.familyMember) return 'app'
  if (user.doctor || user.role === 'DOCTOR') return 'doctor'
  if (user.clinicAdminProfile || user.role === 'CLINIC_ADMIN') return 'clinic'
  if (user.role === 'PLATFORM_ADMIN') return 'admin'
  const appRoles: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']
  if (appRoles.includes(user.role)) return 'app'
  return undefined
}
