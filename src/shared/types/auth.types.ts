import type { Role } from '@prisma/client'

// Payload armazenado dentro do JWT (access token e refresh token)
export interface JwtPayload {
  sub: string // userId
  role: Role
  jti: string // JWT ID único — usado para revogação
  iat?: number
  exp?: number
}

// Payload mínimo do refresh token (sub + jti)
export interface RefreshTokenPayload {
  sub: string
  jti: string
  /** Quando presente, sessão destinada ao painel web (médico/clínica/admin). */
  aud?: 'web'
  iat?: number
  exp?: number
}

// Contexto de usuário resolvido pelo middleware de autenticação
export interface AuthUser {
  id: string
  role: Role
  jti: string
}
