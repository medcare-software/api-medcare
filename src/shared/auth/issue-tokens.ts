import type { Role } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'

import { env } from '../../config/env.js'
import { authService } from '../../modules/auth/auth.service.js'
import type { JwtPayload, RefreshTokenPayload } from '../types/auth.types.js'

export async function issueTokens(
  fastify: FastifyInstance,
  user: { id: string; role: Role },
  options?: { audience?: 'web'; deviceLabel?: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  const jti = nanoid()

  const accessPayload: JwtPayload = {
    sub: user.id,
    role: user.role,
    jti,
  }

  const refreshPayload: RefreshTokenPayload = {
    sub: user.id,
    jti,
    ...(options?.audience === 'web' && { aud: 'web' }),
  }

  const accessToken = fastify.jwt.sign(accessPayload, { expiresIn: env.JWT_ACCESS_EXPIRES_IN })
  const refreshToken = fastify.jwt.sign(refreshPayload, { expiresIn: env.JWT_REFRESH_EXPIRES_IN })

  await authService.storeRefreshToken(user.id, jti, refreshToken, options?.deviceLabel)

  return { accessToken, refreshToken }
}
