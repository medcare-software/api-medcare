import type { AuthUser } from './auth.types.js'

// Configura apenas o tipo de `user` no @fastify/jwt.
// Não restringimos `payload` para permitir sign() com qualquer objeto
// (access token e refresh token têm shapes diferentes).
// O mapeamento sub → id é feito manualmente em authenticate.ts.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: AuthUser
  }
}
