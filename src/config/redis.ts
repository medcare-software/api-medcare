import { Redis } from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined
}

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const password = process.env.REDIS_PASSWORD || undefined
  const tls = process.env.REDIS_TLS === 'true'

  const client = new Redis(url, {
    password,
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  })

  client.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err)
  })

  return client
}

function getOrCreateRedis(): Redis {
  if (process.env.NODE_ENV === 'production') {
    return createRedisClient()
  }
  if (!globalThis.__redis) {
    globalThis.__redis = createRedisClient()
  }
  return globalThis.__redis
}

export const redis: Redis = getOrCreateRedis()
