import { PrismaClient } from '@prisma/client'

// Reutiliza a instância no hot-reload do desenvolvimento (evita "Too many connections")
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: ['warn', 'error'],
  })
}

function getOrCreatePrisma(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return createPrismaClient()
  }
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient()
  }
  return globalThis.__prisma
}

export const db: PrismaClient = getOrCreatePrisma()
