import type { Role } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { AppError } from '../errors/index.js'

/**
 * Factory: retorna um preHandler que restringe o acesso aos roles informados.
 * Deve ser usado após o middleware `authenticate`.
 *
 * @example
 * fastify.get('/admin', { preHandler: [authenticate, authorize('PLATFORM_ADMIN')] }, handler)
 */
export function authorize(...roles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!roles.includes(request.user.role)) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      })
    }
  }
}
