import type { AuthUser } from './auth.types.js'

// Extensão da interface do FastifyRequest para adicionar
// as propriedades injetadas pelos middlewares da aplicação.
declare module 'fastify' {
  interface FastifyRequest {
    // Populado pelo middleware authenticate.ts após verificar o JWT
    user: AuthUser
  }
}
