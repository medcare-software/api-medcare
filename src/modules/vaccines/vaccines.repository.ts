import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'
import type {
  CreateVaccineInput,
  RecordVaccineDoseInput,
  UpdateVaccineInput,
} from './vaccines.schema.js'

export const vaccinesRepository = {
  findManyByMemberIds(memberIds: string[]) {
    return db.vaccine.findMany({
      where: { memberId: { in: memberIds } },
      orderBy: { createdAt: 'desc' },
    })
  },

  findByIdScoped(id: string, memberIds: string[]) {
    return db.vaccine.findFirst({ where: { id, memberId: { in: memberIds } } })
  },

  // Único ponto que busca uma Vaccine sem escopo de família — usado apenas no
  // padrão "buscar-depois-autorizar" para leitura por médico/clínica (ver service).
  findById(id: string) {
    return db.vaccine.findUnique({ where: { id } })
  },

  create(memberId: string, input: Omit<CreateVaccineInput, 'memberId'>) {
    return db.vaccine.create({ data: { memberId, ...omitUndefined(input) } })
  },

  update(id: string, input: UpdateVaccineInput) {
    return db.vaccine.update({ where: { id }, data: omitUndefined(input) })
  },

  updateStatus(id: string, status: 'UP_TO_DATE' | 'BOOSTER_DUE') {
    return db.vaccine.update({ where: { id }, data: { status } })
  },

  delete(id: string) {
    return db.vaccine.delete({ where: { id } })
  },

  createDose(vaccineId: string, input: RecordVaccineDoseInput) {
    return db.vaccineDose.create({ data: { vaccineId, ...omitUndefined(input) } })
  },

  findDosesByVaccineId(vaccineId: string) {
    return db.vaccineDose.findMany({ where: { vaccineId }, orderBy: { appliedAt: 'desc' } })
  },
}
