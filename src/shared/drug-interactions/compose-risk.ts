import type { MedicationRisk, MedicationRiskCheckResult } from '../ai/medication-risk.client.js'
import type { ImsesCheckResult } from './imses.client.js'

export type ComposedRisk = MedicationRisk & { source: 'ai' | 'imses' }

export interface ComposedRiskResult {
  hasRisk: boolean
  risks: ComposedRisk[]
  degraded: boolean
}

// Prioridade combinada IMSES + IA (não é um merge simples):
// - Interação medicamento-medicamento: o IMSES é a fonte quando reconhece os
//   nomes consultados (mesmo sem interação encontrada) — nesse caso os itens
//   `type: 'interaction'` da IA são descartados, pra não duplicar/contradizer
//   uma fonte oficial com um palpite da IA. Só quando o IMSES não reconhece
//   os medicamentos ou está fora do ar (recognized=false) a IA cobre a
//   interação sozinha, exatamente como funcionava antes desta integração.
// - Alergia: sempre só a IA — o IMSES não tem esse conceito.
export function composeRisk(
  aiResult: MedicationRiskCheckResult,
  imsesResult: ImsesCheckResult,
): ComposedRiskResult {
  const aiRisks: ComposedRisk[] = aiResult.risks.map((risk) => ({ ...risk, source: 'ai' }))

  const risks: ComposedRisk[] = imsesResult.recognized
    ? [
        ...imsesResult.risks.map((risk): ComposedRisk => ({ ...risk, source: 'imses' })),
        ...aiRisks.filter((risk) => risk.type === 'allergy'),
      ]
    : aiRisks

  return {
    hasRisk: risks.length > 0,
    risks,
    degraded: aiResult.degraded,
  }
}

/**
 * Decide se a checagem ficou incompleta de verdade.
 * `aiDegraded` sozinho não basta: sem meds ativos / sem alergias não há o que
 * cruzar (1º medicamento), e interação pode estar coberta só pelo IMSES.
 * `newDrugCount > 1` (receituário) também exige checagem entre os itens novos.
 */
export function isRiskCheckDegraded(params: {
  aiDegraded: boolean
  imsesRecognized: boolean
  activeMedicationCount: number
  allergyCount: number
  newDrugCount?: number
}): boolean {
  const newDrugCount = params.newDrugCount ?? 1
  const needsInteractionCheck = params.activeMedicationCount > 0 || newDrugCount > 1
  const needsAllergyCheck = params.allergyCount > 0
  const interactionCovered =
    !needsInteractionCheck || params.imsesRecognized || !params.aiDegraded
  const allergyCovered = !needsAllergyCheck || !params.aiDegraded
  return !interactionCovered || !allergyCovered
}
