import { z } from 'zod'

const envSchema = z.object({
  // ── Server ──────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SERVER_HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),

  // ── Database ────────────────────────────────────────────
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // ── Redis ───────────────────────────────────────────────
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // ── JWT ─────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // ── Criptografia de campos sigilosos ──────────────────────
  FIELD_ENCRYPTION_KEY: z
    .string()
    .length(64, 'FIELD_ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)'),
  BLIND_INDEX_PEPPER: z.string().min(32),

  // ── Storage (MinIO / S3-compatible) ───────────────────────
  STORAGE_DRIVER: z.enum(['minio', 's3']).default('minio'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  MINIO_ACCESS_KEY: z.string().default('medcare'),
  MINIO_SECRET_KEY: z.string().default('medcare123456'),
  MINIO_BUCKET: z.string().default('medcare-files'),

  // ── App ──────────────────────────────────────────────────
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60000),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.trim().replace(/\/$/, '') || 'http://localhost:5173'),
  MEDICAL_ACCESS_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  MEDICAL_ACCESS_TEMPORARY_GRANT_DAYS: z.coerce.number().int().positive().default(30),
  FILE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // ── Retention / LGPD ───────────────────────────────────────
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  SOFT_DELETE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')

  console.error(`❌ Invalid environment variables:\n${formatted}`)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
