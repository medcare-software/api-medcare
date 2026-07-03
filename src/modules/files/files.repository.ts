import { randomUUID } from 'node:crypto'

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

  presignedGetUrl(objectKey: string, expirySeconds: number) {
    return storageClient.presignedGetObject(FILES_BUCKET, objectKey, expirySeconds)
  },

  generateObjectKey(): string {
    return randomUUID()
  },
}

async function ensureBucket() {
  const exists = await storageClient.bucketExists(FILES_BUCKET)
  if (!exists) {
    await storageClient.makeBucket(FILES_BUCKET)
  }
}
