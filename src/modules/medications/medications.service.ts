import type { Role } from '@prisma/client'

import {
  assertClinicalReadAccess,
  assertMemberInScope,
  resolveAccessibleMemberIds,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { medicationsRepository } from './medications.repository.js'
import type {
  CreateMedicationInput,
  RecordDoseInput,
  UpdateMedicationInput,
} from './medications.schema.js'

const FAMILY_WRITER_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']

export const medicationsService = {
  async list(user: AuthUser, memberId: string, filters: { active?: boolean }) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_MEDICATIONS',
      targetType: 'FamilyMember',
    })
    return medicationsRepository.findManyByMemberIds([memberId], filters)
  },

  async create(user: AuthUser, input: CreateMedicationInput) {
    assertFamilyWriter(user)
    await assertMemberInScope(user, input.memberId)
    const { memberId, ...data } = input
    return medicationsRepository.create(memberId, data)
  },

  async update(user: AuthUser, id: string, input: UpdateMedicationInput) {
    assertFamilyWriter(user)
    const medication = await getScopedOrThrow(user, id)
    return medicationsRepository.update(medication.id, input)
  },

  async deactivate(user: AuthUser, id: string) {
    assertFamilyWriter(user)
    const medication = await getScopedOrThrow(user, id)
    await medicationsRepository.deactivate(medication.id)
  },

  async recordDose(user: AuthUser, medicationId: string, input: RecordDoseInput) {
    assertFamilyWriter(user)
    const medication = await getScopedOrThrow(user, medicationId)
    return medicationsRepository.createDoseRecord(medication.id, {
      ...input,
      recordedById: user.id,
    })
  },

  async listDoses(user: AuthUser, medicationId: string) {
    const medication = await getMedicationForRead(user, medicationId)
    return medicationsRepository.findDoseRecordsByMedicationId(medication.id)
  },

  // Permite desfazer o registro de uma dose (ex.: usuário marcou "tomado" por
  // engano) — só quem pode registrar dose pode apagá-la, e só a dose pertencente
  // à medicação/família em escopo.
  async deleteDose(user: AuthUser, medicationId: string, doseId: string) {
    assertFamilyWriter(user)
    const medication = await getScopedOrThrow(user, medicationId)
    const dose = await medicationsRepository.findDoseRecordByIdScoped(doseId, medication.id)
    if (!dose) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Registro de dose não encontrado' })
    }
    await medicationsRepository.deleteDoseRecord(dose.id)
  },
}

function assertFamilyWriter(user: AuthUser) {
  if (!FAMILY_WRITER_ROLES.includes(user.role)) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode gerenciar medicações' })
  }
}

async function getScopedOrThrow(user: AuthUser, id: string) {
  const memberIds = await resolveAccessibleMemberIds(user)
  const medication = await medicationsRepository.findByIdScoped(id, memberIds)
  if (!medication) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Medicação não encontrada' })
  }
  return medication
}

// MedicationDoseRecord não guarda memberId próprio — para leitura por família,
// escopamos pela Medication pai. Para DOCTOR/CLINIC_ADMIN, buscamos a Medication
// sem escopo de família e só então autorizamos via grant (ver assertClinicalReadAccess).
async function getMedicationForRead(user: AuthUser, id: string) {
  if (FAMILY_WRITER_ROLES.includes(user.role)) {
    return getScopedOrThrow(user, id)
  }

  const medication = await medicationsRepository.findById(id)
  if (!medication) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Medicação não encontrada' })
  }
  await assertClinicalReadAccess(user, medication.memberId, {
    action: 'VIEW_MEDICATION_DOSES',
    targetType: 'Medication',
  })
  return medication
}
