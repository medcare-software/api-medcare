import crypto from 'node:crypto'

import { env } from '../../config/env.js'

// Campos sigilosos (CPF, CNPJ, razão social, descrição de diagnóstico/conduta,
// observações clínicas) nunca são persistidos em texto plano. Este módulo cifra
// cada valor com AES-256-GCM usando uma chave única do ambiente — NUNCA hardcoded.
//
// Formato do Buffer armazenado: [iv (12 bytes)][authTag (16 bytes)][ciphertext]

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex')
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hex)')
  }
  return key
}

// Retorno explicitamente parametrizado como Buffer<ArrayBuffer> (não o Buffer<ArrayBufferLike>
// default) porque o Prisma tipa campos Bytes como Uint8Array<ArrayBuffer> — Buffer.concat()
// sempre aloca sobre um ArrayBuffer comum, nunca SharedArrayBuffer, então isso é só precisão de tipo.
export function encryptField(plainText: string): Buffer<ArrayBuffer> {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]) as Buffer<ArrayBuffer>
}

// Aceita Uint8Array porque o Prisma retorna campos `Bytes` como Uint8Array (não Buffer)
export function decryptField(payload: Uint8Array): string {
  const buffer = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
  const iv = buffer.subarray(0, IV_LENGTH)
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
