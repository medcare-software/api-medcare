import { assertClinicalReadAccess } from '../../shared/access/index.js'
import { decryptField } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { diagnosticsRepository } from '../diagnostics/diagnostics.repository.js'
import { examsRepository } from '../exams/exams.repository.js'
import { medicationsRepository } from '../medications/medications.repository.js'
import { proceduresRepository } from '../procedures/procedures.repository.js'

export type ClinicalHistoryEventType = 'diagnostic' | 'procedure' | 'exam' | 'medication-start'

export interface ClinicalHistoryEvent {
  id: string
  type: ClinicalHistoryEventType
  date: Date
  title: string
  author: string
  role: string | null
  description: string | null
}

function doctorLabel(doctor?: { crmNumber: string; crmState: string } | null): string {
  return doctor ? `CRM ${doctor.crmNumber}/${doctor.crmState}` : 'Médico'
}

export const clinicalHistoryService = {
  // Agrega registros de módulos já existentes num feed único, sem persistir nada
  // novo — leitura pura. Vacinas ficam fora por ora (fora do escopo desta rodada).
  async list(user: AuthUser, memberId: string): Promise<ClinicalHistoryEvent[]> {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_CLINICAL_HISTORY',
      targetType: 'FamilyMember',
    })

    const [diagnostics, procedures, exams, medications] = await Promise.all([
      diagnosticsRepository.findManyByMemberId(memberId),
      proceduresRepository.findManyByMemberId(memberId),
      examsRepository.findManyByMemberIds([memberId]),
      medicationsRepository.findManyByMemberIds([memberId]),
    ])

    const events: ClinicalHistoryEvent[] = [
      ...diagnostics.map((diagnostic) => ({
        id: diagnostic.id,
        type: 'diagnostic' as const,
        date: diagnostic.diagnosedAt,
        title: diagnostic.title,
        author: doctorLabel(diagnostic.doctor),
        role: null,
        description: decryptField(diagnostic.descriptionEncrypted),
      })),
      ...procedures.map((procedure) => ({
        id: procedure.id,
        type: 'procedure' as const,
        date: procedure.performedAt,
        title: procedure.title,
        author: doctorLabel(procedure.doctor),
        role: null,
        description: procedure.descriptionEncrypted
          ? decryptField(procedure.descriptionEncrypted)
          : null,
      })),
      ...exams.map((exam) => ({
        id: exam.id,
        type: 'exam' as const,
        date: exam.examDate,
        title: exam.name,
        author: exam.doctorId ? doctorLabel(exam.doctor) : 'Família',
        role: null,
        description: null,
      })),
      ...medications.map((medication) => ({
        id: medication.id,
        type: 'medication-start' as const,
        date: medication.startDate,
        title: medication.name,
        author: 'Família',
        role: null,
        description: `${medication.dosage}${medication.dosageUnit} • ${medication.frequency}`,
      })),
    ]

    return events.sort((a, b) => b.date.getTime() - a.date.getTime())
  },
}
