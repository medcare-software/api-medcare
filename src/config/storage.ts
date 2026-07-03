import { Client } from 'minio'

import { env } from './env.js'

// Cliente MinIO singleton — bucket privado, nunca público (ver CLAUDE.md, regra de uploads).
export const storageClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
})

export const FILES_BUCKET = env.MINIO_BUCKET
