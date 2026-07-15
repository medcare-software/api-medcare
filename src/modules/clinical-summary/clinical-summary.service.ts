import { assertClinicalReadAccess } from '../../shared/access/index.js'
import { decryptField } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { clinicalSummaryRepository } from './clinical-summary.repository.js'

export interface ClinicalSummary {
  bloodType: string | null
  allergies: string[]
  conditions: string[]
  notes: string | null
}

export const clinicalSummaryService = {
  // Leitura só — o resumo clínico é escrito pela própria família (ver
  // families.service.ts#upsertHealthProfile). Aqui só se expõe pra médico/clínica
  // com grant ativo, que é quem não tinha nenhuma rota de leitura até agora.
  async get(user: AuthUser, memberId: string): Promise<ClinicalSummary> {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_CLINICAL_SUMMARY',
      targetType: 'FamilyMember',
    })

    const profile = await clinicalSummaryRepository.findByMemberId(memberId)
    if (!profile) {
      return { bloodType: null, allergies: [], conditions: [], notes: null }
    }

    return {
      bloodType: profile.bloodType,
      allergies: profile.allergies,
      conditions: profile.conditions,
      notes: profile.notesEncrypted ? decryptField(profile.notesEncrypted) : null,
    }
  },
}
