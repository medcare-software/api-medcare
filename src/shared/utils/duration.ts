const UNIT_TO_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
}

/** Converte strings como "15m", "30d" (formato aceito pelo @fastify/jwt expiresIn) em milissegundos. */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim())
  if (!match) {
    throw new Error(`Invalid duration format: "${value}" (expected e.g. "15m", "30d")`)
  }
  const [, amount = '0', unit = 's'] = match
  const unitMs = UNIT_TO_MS[unit] ?? 0
  return Number(amount) * unitMs
}
