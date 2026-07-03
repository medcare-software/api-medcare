import type { FastifyInstance } from 'fastify'

import { issueTokens } from '../../shared/auth/issue-tokens.js'
import { authenticate } from '../../shared/middlewares/index.js'
import { decryptField } from '../../shared/security/index.js'
import type { RefreshTokenPayload } from '../../shared/types/auth.types.js'
import { LoginSchema, LogoutSchema, RefreshSchema } from './auth.schema.js'
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
      'email' in body.data
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
      },
    })
  })
}
