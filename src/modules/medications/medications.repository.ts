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

  findByIdempotencyKey(idempotencyKey: string) {
    return db.medication.findUnique({ where: { idempotencyKey } })
  },

  create(
    memberId: string,
    input: Omit<CreateMedicationInput, 'memberId'>,
    idempotencyKey?: string,
  ) {
    return db.medication.create({
      data: {
        memberId,
        ...omitUndefined(input),
        ...(idempotencyKey && { idempotencyKey }),
      },
    })
  },

  update(id: string, input: UpdateMedicationInput) {
    return db.medication.update({ where: { id }, data: omitUndefined(input) })
  },

  deactivate(id: string, reason: string) {
    return db.medication.update({
      where: { id },
      data: { active: false, deactivationReason: reason },
    })
  },

  // Chamado só internamente ao registrar dose TAKEN — não passa pelo UpdateMedicationInput
  // público de propósito (lowStockNotifiedAt não é um campo editável pelo cliente).
  decrementStock(id: string, newStockQuantity: number, markNotified: boolean) {
    return db.medication.update({
      where: { id },
      data: {
        stockQuantity: newStockQuantity,
        ...(markNotified && { lowStockNotifiedAt: new Date() }),
      },
    })
  },

  resetLowStockNotification(id: string) {
    return db.medication.update({ where: { id }, data: { lowStockNotifiedAt: null } })
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
