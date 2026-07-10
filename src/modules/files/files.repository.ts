import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'

import { env } from '../../config/env.js'
import { FILES_BUCKET, storageClient } from '../../config/storage.js'

export const filesRepository = {
  async putObject(
    objectKey: string,
    buffer: Buffer,
    contentType: string,
    meta: Record<string, string>,
  ) {
    await ensureBucket()
    await storageClient.putObject(FILES_BUCKET, objectKey, buffer, buffer.length, {
      'Content-Type': contentType,
      ...meta,
    })
  },

  statObject(objectKey: string) {
    return storageClient.statObject(FILES_BUCKET, objectKey)
  },

  async getObject(objectKey: string): Promise<Buffer> {
    const stream: Readable = await storageClient.getObject(FILES_BUCKET, objectKey)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks)
  },

  presignedGetUrl(objectKey: string, expirySeconds: number) {
    return storageClient.presignedGetObject(FILES_BUCKET, objectKey, expirySeconds)
  },

  generateObjectKey(): string {
    return randomUUID()
  },
}

async function ensureBucket() {
  // Em S3 real, o bucket é criado e gerenciado externamente pelo cliente —
  // pular a checagem evita exigir s3:ListBucket/s3:CreateBucket na IAM policy,
  // que fica restrita só a s3:PutObject/s3:GetObject.
  if (env.STORAGE_DRIVER === 's3') return

  const exists = await storageClient.bucketExists(FILES_BUCKET)
  if (!exists) {
    await storageClient.makeBucket(FILES_BUCKET)
  }
}
