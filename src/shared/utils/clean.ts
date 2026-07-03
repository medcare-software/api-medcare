/**
 * Remove chaves com valor `undefined` de um objeto e re-tipa sem o `| undefined`
 * explícito que o Zod adiciona a campos `.optional()`. Necessário porque o projeto
 * roda com `exactOptionalPropertyTypes`: os inputs de create/update do Prisma para
 * campos opcionais aceitam a chave ausente, mas não um valor `undefined` explícito.
 */
export function omitUndefined<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result as { [K in keyof T]: Exclude<T[K], undefined> }
}
