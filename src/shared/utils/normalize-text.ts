// Normalização usada pra comparar nomes de medicamento vindos de fontes
// diferentes (usuário, IA, IMSES) sem se importar com acento/caixa —
// ver shared/ai/medication-risk.client.ts e shared/drug-interactions/imses.client.ts.
export function normalizeDrugName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}
