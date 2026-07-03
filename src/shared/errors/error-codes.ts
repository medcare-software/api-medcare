// Códigos de erro padronizados da aplicação.
// Usados em AppError e nas respostas JSON de erro.

export const ErrorCode = {
  // ── Auth ──────────────────────────────────────────────
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_REVOKED: 'TOKEN_REVOKED',

  // ── Recursos ──────────────────────────────────────────
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // ── Validação ─────────────────────────────────────────
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // ── Acesso médico / prontuário ──────────────────────────
  MEDICAL_ACCESS_REQUIRED: 'MEDICAL_ACCESS_REQUIRED',
  ACCESS_CODE_INVALID: 'ACCESS_CODE_INVALID',
  ACCESS_CODE_EXPIRED: 'ACCESS_CODE_EXPIRED',

  // ── Rate limit ───────────────────────────────────────
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // ── Storage (MinIO) ────────────────────────────────────
  STORAGE_ERROR: 'STORAGE_ERROR',

  // ── Servidor ──────────────────────────────────────────
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
