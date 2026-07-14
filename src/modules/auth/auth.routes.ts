import type { FastifyInstance } from 'fastify'

import { issueTokens } from '../../shared/auth/issue-tokens.js'
import { authenticate } from '../../shared/middlewares/index.js'
import { decryptField } from '../../shared/security/index.js'
import type { RefreshTokenPayload } from '../../shared/types/auth.types.js'
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  ResetPasswordSchema,
  ValidateResetSessionSchema,
  VerifyResetCodeSchema,
} from './auth.schema.js'
import { authService } from './auth.service.js'

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

    const tokens = await issueTokens(fastify, { id: user.id, role: user.role })

    return reply.status(200).send({
      data: {
        ...tokens,
        user: { id: user.id, email: user.email, role: user.role },
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
    const tokens = await issueTokens(fastify, { id: user.id, role: user.role })

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
        email: user.email,
        role: user.role,
        phone: user.phone,
        cpf: user.cpfEncrypted ? decryptField(user.cpfEncrypted) : null,
        status: user.status,
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
            }
          : null,
      },
    })
  })

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
    const valid = authService.validateResetSessionToken(fastify, body.data.token)
    return reply.status(200).send({ data: { valid } })
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
}
