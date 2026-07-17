import type { ErrorCode } from './error-codes.js'

export interface AppErrorOptions {
  message: string
  code: ErrorCode
  statusCode?: number
  details?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly details?: unknown

  constructor({ message, code, statusCode, details }: AppErrorOptions) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode ?? AppError.defaultStatusCode(code)
    this.details = details

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  private static defaultStatusCode(code: ErrorCode): number {
    const map: Partial<Record<ErrorCode, number>> = {
      UNAUTHORIZED: 401,
      INVALID_CREDENTIALS: 401,
      TOKEN_EXPIRED: 401,
      TOKEN_INVALID: 401,
      TOKEN_REVOKED: 401,
      SESSION_LIMIT_REACHED: 409,
      FORBIDDEN: 403,
      MEDICAL_ACCESS_REQUIRED: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      PLAN_LIMIT_REACHED: 409,
      ACCESS_CODE_INVALID: 400,
      ACCESS_CODE_EXPIRED: 410,
      VALIDATION_ERROR: 400,
      INVALID_INPUT: 400,
      RATE_LIMIT_EXCEEDED: 429,
      STORAGE_ERROR: 500,
      EMAIL_SEND_FAILED: 500,
      AI_EXTRACTION_FAILED: 500,
      GMAIL_OAUTH_STATE_INVALID: 400,
      GMAIL_OAUTH_EXCHANGE_FAILED: 500,
      GMAIL_NOT_CONNECTED: 404,
      DATABASE_ERROR: 500,
      INTERNAL_SERVER_ERROR: 500,
    }
    return map[code] ?? 500
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
    }
  }
}
