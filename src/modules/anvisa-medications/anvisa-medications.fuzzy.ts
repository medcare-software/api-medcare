/** Normaliza texto pra comparação tipográfica (acentos, case, espaços). */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}

/** Distância de Levenshtein — usada pra sugerir grafias próximas (ex. Dorfrex → Dorflex). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      )
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0
  }
  return prev[b.length] ?? 0
}

/**
 * Score menor = melhor match.
 * Contém / prefixo no nome → bônus forte; senão usa distância tipográfica.
 */
export function scoreMedicationName(query: string, medicationName: string): number {
  const q = normalizeSearchText(query)
  const name = normalizeSearchText(medicationName)
  if (!q || !name) return Number.POSITIVE_INFINITY
  if (name === q) return 0
  if (name.startsWith(q)) return 0.5
  if (name.includes(q)) return 1

  const tokens = name.split(/\s+/).filter(Boolean)
  let best = levenshtein(q, name)
  for (const token of tokens) {
    best = Math.min(best, levenshtein(q, token))
  }

  // Tolerância relativa: typos curtos (Dorfrex/Dorflex = 1) passam; lixo longe não.
  const maxAllowed = Math.max(2, Math.floor(q.length * 0.35))
  if (best > maxAllowed) return Number.POSITIVE_INFINITY
  return 10 + best
}

/** Rankeia pelo melhor entre nome comercial e fármaco/associação. */
export function scoreCatalogItem(
  query: string,
  item: { medicationName: string; substance: string },
): number {
  return Math.min(scoreMedicationName(query, item.medicationName), scoreMedicationName(query, item.substance))
}
