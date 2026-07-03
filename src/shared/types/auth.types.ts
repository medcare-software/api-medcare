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

// Emitido só por POST /auth/forgot-password/verify, curta duração (ver
// env.PASSWORD_RESET_SESSION_EXPIRES_IN). Sem `role`, então nunca passa pelo
// middleware `authenticate` (que exige sub+role) — não pode virar access token.
export interface PasswordResetSessionPayload {
  sub: string
  purpose: 'password_reset'
  iat?: number
  exp?: number
}
