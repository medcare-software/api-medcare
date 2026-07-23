import { assertOwnScopedMemberInScope } from '../../shared/access/index.js'
import { type MedicationRisk, checkMedicationRisk } from '../../shared/ai/medication-risk.client.js'
import { getMedicationRiskContext } from '../../shared/ai/medication-risk.helpers.js'
import { recordAuditEvent } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import type { CheckMedicationRiskInput } from './medication-risk-check.schema.js'

// Texto fixo (não vem da IA) mostrado junto de cada risco reportado — evita
// variação de fraseado entre chamadas e mantém app/web usando exatamente o
// mesmo texto (fonte única, ver Figma 6215-4268).
const DISCLAIMER =
  'Recomendados consultar o médico responsável antes de administrar os medicamentos juntos.'

export interface MedicationRiskCheckResponse {
  hasRisk: boolean
  risks: MedicationRisk[]
  disclaimer: string
  degraded: boolean
}

export const medicationRiskCheckService = {
  async check(
    user: AuthUser,
    input: CheckMedicationRiskInput,
  ): Promise<MedicationRiskCheckResponse> {
    await assertOwnScopedMemberInScope(user, input.memberId)

    const context = await getMedicationRiskContext(input.memberId)
    const result = await checkMedicationRisk({
      newDrugs: [{ name: input.name, dosage: `${input.dosage}${input.dosageUnit}` }],
      activeMedications: context.activeMedications,
      allergies: context.allergies,
    })

    // Toda checagem fica registrada — inclusive quando degradada, pra dar
    // visibilidade operacional de que a IA não rodou (ver Decisões de
    // arquitetura do plano: fail-open não pode ser silencioso).
    await recordAuditEvent({
      actorId: user.id,
      action: result.degraded ? 'MEDICATION_RISK_CHECK_DEGRADED' : 'MEDICATION_RISK_CHECK',
      targetType: 'FamilyMember',
      targetId: input.memberId,
      metadata: {
        drugName: input.name,
        hasRisk: result.hasRisk,
        riskCount: result.risks.length,
      },
    })

    return {
      hasRisk: result.hasRisk,
      risks: result.risks,
      disclaimer: DISCLAIMER,
      degraded: result.degraded,
    }
  },
}
