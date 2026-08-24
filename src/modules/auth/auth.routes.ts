import type { FastifyInstance } from 'fastify'

import { isAiCurrentlyEnabled } from '../../shared/access/ai-trial.js'
import { issueTokens } from '../../shared/auth/issue-tokens.js'
import { authenticate, authorize } from '../../shared/middlewares/index.js'
import { decryptField } from '../../shared/security/index.js'
import type { RefreshTokenPayload } from '../../shared/types/auth.types.js'
import { getDeviceLabel } from '../../shared/utils/index.js'
import {
  AcceptProfessionalTermsSchema,
  ChangePasswordSchema,
  DeleteAccountSchema,
  ForgotPasswordSchema,
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  ResetPasswordSchema,
  ValidateResetSessionSchema,
  VerifyResetCodeSchema,
} from './auth.schema.js'
import { authService } from './auth.service.js'

function hasAcceptedProfessionalTerms(user: {
  professionalCommitmentAcceptedAt: Date | null
  professionalSecurityPolicyAcceptedAt: Date | null
}) {
  return Boolean(
    user.professionalCommitmentAcceptedAt && user.professionalSecurityPolicyAcceptedAt,
  )
}

function hasAcceptedConsumerTerms(user: {
  termsOfUseAcceptedAt: Date | null
  privacyPolicyAcceptedAt: Date | null
}) {
  return Boolean(user.termsOfUseAcceptedAt && user.privacyPolicyAcceptedAt)
}

export default async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/login — e-mail (paciente/família/cuidador/clínica/admin) ou CRM (médico)
  fastify.post('/auth/login', async (req, reply) => {
    const body = LoginSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }

    const user =
      'identifier' in body.data
        ? await authService.validateIdentifierLogin(body.data)
        : 'email' in body.data
          ? await authService.validateEmailLogin(body.data)
          : await authService.validateCrmLogin(body.data)

    await authService.enforceSessionCapacity(user.id, user.role)
    await authService.recordLogin(user.id)

    const deviceLabel = getDeviceLabel(req.headers['user-agent'])
    const tokens = await issueTokens(fastify, { id: user.id, role: user.role }, { deviceLabel })

    return reply.status(200).send({
      data: {
        ...tokens,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          professionalTermsAccepted: hasAcceptedProfessionalTerms(user),
          consumerTermsAccepted: hasAcceptedConsumerTerms(user),
        },
      },
    })
  })

  // POST /auth/refresh
  fastify.post('/auth/refresh', async (req, reply) => {
    const body = RefreshSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }

    let payload: RefreshTokenPayload
    try {
      payload = fastify.jwt.verify<RefreshTokenPayload>(body.data.refreshToken)
    } catch {
      return reply.status(401).send({ code: 'TOKEN_INVALID', message: 'Refresh token inválido' })
    }

    const user = await authService.validateAndRotateSession(payload.jti)
    // Preserva o papel da sessão (multi-papel: mesmo User pode ser DOCTOR no web
    // e PATIENT_ADMIN no app). Tokens antigos sem `role` caem no User.role do banco.
    const sessionRole = payload.role ?? user.role
    // Preserva o rótulo do dispositivo na rotação (mesma sessão física, só o token muda).
    const deviceLabel = getDeviceLabel(req.headers['user-agent'])
    const tokens = await issueTokens(
      fastify,
      { id: user.id, role: sessionRole },
      { deviceLabel },
    )

    return reply.status(200).send({ data: tokens })
  })

  // POST /auth/logout (requer autenticação)
  fastify.post('/auth/logout', { preHandler: [authenticate] }, async (req, reply) => {
    const body = LogoutSchema.safeParse(req.body)
    if (body.success) {
      try {
        const payload = fastify.jwt.verify<RefreshTokenPayload>(body.data.refreshToken)
        await authService.revokeSession(payload.jti)
      } catch {
        // logout é idempotente mesmo com refresh token inválido/expirado
      }
    }
    await authService.revokeSession(req.user.jti)
    return reply.status(204).send()
  })

  // GET /auth/me (requer autenticação) — dado do próprio usuário, sem máscara
  // (é o dono do dado). Qualquer outro endpoint que exponha CPF de terceiros
  // deve usar maskCpf() por padrão — ver src/shared/security/mask.ts.
  fastify.get('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    const user = await authService.me(req.user.id)
    return reply.status(200).send({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        // Papel da sessão (JWT), não User.role do banco — multi-papel.
        role: req.user.role,
        phone: user.phone,
        state: user.state,
        city: user.city,
        cpf: user.cpfEncrypted ? decryptField(user.cpfEncrypted) : null,
        status: user.status,
        aiEnabled: isAiCurrentlyEnabled(user),
        aiStartsAt: user.aiStartsAt,
        aiTrialEndsAt: user.aiTrialEndsAt,
        professionalTermsAccepted: hasAcceptedProfessionalTerms(user),
        professionalTermsVersion: user.professionalTermsVersion,
        consumerTermsAccepted: hasAcceptedConsumerTerms(user),
        consumerTermsVersion: user.consumerTermsVersion,
        doctor: user.doctor
          ? {
              crmNumber: user.doctor.crmNumber,
              crmState: user.doctor.crmState,
              specialties: user.doctor.specialties,
            }
          : null,
        familyMember: user.familyMember
          ? {
              id: user.familyMember.id,
              familyId: user.familyMember.familyId,
              isAdmin: user.familyMember.isAdmin,
              familyName: user.familyMember.family?.name ?? null,
              birthDate: user.familyMember.birthDate,
              biologicalSex: user.familyMember.biologicalSex,
              hasCpf: !!user.familyMember.cpfHash,
              healthProfile: user.familyMember.healthProfile
                ? {
                    weightKg: user.familyMember.healthProfile.weightKg,
                    heightM: user.familyMember.healthProfile.heightM,
                    bloodType: user.familyMember.healthProfile.bloodType,
                  }
                : null,
            }
          : null,
      },
    })
  })

  fastify.post(
    '/auth/accept-professional-terms',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const body = AcceptProfessionalTermsSchema.safeParse(req.body)
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      const updated = await authService.acceptProfessionalTerms(req.user.id, req.user.role)
      return reply.status(200).send({
        data: {
          professionalTermsAccepted: hasAcceptedProfessionalTerms(updated),
          professionalTermsVersion: updated.professionalTermsVersion,
          consumerTermsAccepted: hasAcceptedConsumerTerms(updated),
          consumerTermsVersion: updated.consumerTermsVersion,
        },
      })
    },
  )

  // POST /auth/forgot-password — envia código de 6 dígitos por e-mail
  fastify.post('/auth/forgot-password', async (req, reply) => {
    const body = ForgotPasswordSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    await authService.requestPasswordReset(body.data.email)
    return reply.status(202).send({ data: { message: 'Código enviado para o e-mail informado' } })
  })

  // POST /auth/forgot-password/verify — troca o código por um resetSessionToken de curta duração
  fastify.post('/auth/forgot-password/verify', async (req, reply) => {
    const body = VerifyResetCodeSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    const result = await authService.verifyResetCode(fastify, body.data.email, body.data.code)
    return reply.status(200).send({ data: result })
  })

  // POST /auth/reset-password — define a nova senha e revoga todas as sessões ativas
  fastify.post('/auth/reset-password', async (req, reply) => {
    const body = ResetPasswordSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    await authService.resetPassword(fastify, body.data.resetSessionToken, body.data.newPassword)
    return reply.status(204).send()
  })

  // POST /auth/reset-password/validate — checagem sem efeito colateral, usada pela
  // página https intermediária (web-medcarelp) antes de mostrar "Abrir no app"
  fastify.post('/auth/reset-password/validate', async (req, reply) => {
    const body = ValidateResetSessionSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    const result = await authService.validateResetSessionToken(fastify, body.data.token)
    return reply.status(200).send({ data: result })
  })

  // POST /auth/change-password (requer autenticação) — senha atual + nova, revoga todas as sessões
  fastify.post('/auth/change-password', { preHandler: [authenticate] }, async (req, reply) => {
    const body = ChangePasswordSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      })
    }
    await authService.changePassword(req.user.id, body.data.currentPassword, body.data.newPassword)
    return reply.status(204).send()
  })

  // DELETE /auth/account — soft-delete da própria conta (app). PATIENT_ADMIN
  // cascateia a família; FAMILY_MEMBER/CAREGIVER só a si mesmos.
  // Senha pode vir no body JSON ou em `?password=` — no React Native o body de
  // DELETE pode ser ignorado pelo XHR (mesmo padrão de DELETE /medications/:id).
  fastify.delete(
    '/auth/account',
    {
      preHandler: [authenticate, authorize('PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER')],
    },
    async (req, reply) => {
      const bodyPassword =
        req.body && typeof req.body === 'object' && 'password' in req.body
          ? (req.body as { password?: unknown }).password
          : undefined
      const queryPassword =
        req.query && typeof req.query === 'object' && 'password' in req.query
          ? (req.query as { password?: unknown }).password
          : undefined
      const body = DeleteAccountSchema.safeParse({
        password: bodyPassword ?? queryPassword,
      })
      if (!body.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: body.error.issues,
        })
      }
      await authService.deleteAccount(req.user.id, req.user.role, body.data.password)
      return reply.status(204).send()
    },
  )
}
