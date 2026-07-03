import type { FastifyReply, FastifyRequest } from 'fastify'

import { AppError } from '../errors/index.js'
import type { JwtPayload } from '../types/auth.types.js'

/**
 * preHandler: verifica o Bearer token, decodifica o payload e injeta
 * req.user com o formato AuthUser esperado pela aplicação.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const payload = await request.jwtVerify<JwtPayload>()

    // Rejeita refresh tokens (não possuem role) usados como access tokens
    if (!payload.sub || !payload.role) {
      throw new Error('not an access token')
    }

    request.user = {
      id: payload.sub,
      role: payload.role,
      jti: payload.jti,
    }
  } catch {
    throw new AppError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    })
  }
}
