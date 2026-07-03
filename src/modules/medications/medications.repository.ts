import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'
import type {
  CreateMedicationInput,
  RecordDoseInput,
  UpdateMedicationInput,
} from './medications.schema.js'

export const medicationsRepository = {
  findManyByMemberIds(memberIds: string[], filters: { active?: boolean } = {}) {
    return db.medication.findMany({
      where: {
        memberId: { in: memberIds },
        ...(filters.active !== undefined && { active: filters.active }),
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  findByIdScoped(id: string, memberIds: string[]) {
    return db.medication.findFirst({ where: { id, memberId: { in: memberIds } } })
  },

  // Único ponto que busca uma Medication sem escopo de família — usado apenas no
  // padrão "buscar-depois-autorizar" para leitura por médico/clínica (ver service).
  findById(id: string) {
    return db.medication.findUnique({ where: { id } })
  },

  create(memberId: string, input: Omit<CreateMedicationInput, 'memberId'>) {
    return db.medication.create({ data: { memberId, ...omitUndefined(input) } })
  },

  update(id: string, input: UpdateMedicationInput) {
    return db.medication.update({ where: { id }, data: omitUndefined(input) })
  },

  deactivate(id: string) {
    return db.medication.update({ where: { id }, data: { active: false } })
  },

  createDoseRecord(medicationId: string, input: RecordDoseInput & { recordedById: string }) {
    return db.medicationDoseRecord.create({ data: { medicationId, ...omitUndefined(input) } })
  },

  findDoseRecordsByMedicationId(medicationId: string) {
    return db.medicationDoseRecord.findMany({
      where: { medicationId },
      orderBy: { scheduledAt: 'desc' },
    })
  },

  findDoseRecordByIdScoped(id: string, medicationId: string) {
    return db.medicationDoseRecord.findFirst({ where: { id, medicationId } })
  },

  deleteDoseRecord(id: string) {
    return db.medicationDoseRecord.delete({ where: { id } })
  },
}
