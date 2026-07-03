import type { Role } from '@prisma/client'

import {
  assertClinicalReadAccess,
  assertMemberInScope,
  resolveAccessibleMemberIds,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { vaccinesRepository } from './vaccines.repository.js'
import type {
  CreateVaccineInput,
  RecordVaccineDoseInput,
  UpdateVaccineInput,
} from './vaccines.schema.js'

const FAMILY_WRITER_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']

export const vaccinesService = {
  async list(user: AuthUser, memberId: string) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_VACCINES',
      targetType: 'FamilyMember',
    })
    return vaccinesRepository.findManyByMemberIds([memberId])
  },

  async create(user: AuthUser, input: CreateVaccineInput) {
    assertFamilyWriter(user)
    await assertMemberInScope(user, input.memberId)
    const { memberId, ...data } = input
    return vaccinesRepository.create(memberId, data)
  },

  async update(user: AuthUser, id: string, input: UpdateVaccineInput) {
    assertFamilyWriter(user)
    const vaccine = await getScopedOrThrow(user, id)
    return vaccinesRepository.update(vaccine.id, input)
  },

  async remove(user: AuthUser, id: string) {
    assertFamilyWriter(user)
    const vaccine = await getScopedOrThrow(user, id)
    // Vaccine não tem soft-delete nem campo `active` no schema — remoção é definitiva
    // e cascateia para VaccineDose (onDelete: Cascade).
    await vaccinesRepository.delete(vaccine.id)
  },

  async recordDose(user: AuthUser, vaccineId: string, input: RecordVaccineDoseInput) {
    assertFamilyWriter(user)
    const vaccine = await getScopedOrThrow(user, vaccineId)
    const dose = await vaccinesRepository.createDose(vaccine.id, input)
    if (input.nextBoosterAt && input.nextBoosterAt < new Date()) {
      await vaccinesRepository.updateStatus(vaccine.id, 'BOOSTER_DUE')
    }
    return dose
  },

  async listDoses(user: AuthUser, vaccineId: string) {
    const vaccine = await getVaccineForRead(user, vaccineId)
    return vaccinesRepository.findDosesByVaccineId(vaccine.id)
  },
}

function assertFamilyWriter(user: AuthUser) {
  if (!FAMILY_WRITER_ROLES.includes(user.role)) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode gerenciar vacinas' })
  }
}

async function getScopedOrThrow(user: AuthUser, id: string) {
  const memberIds = await resolveAccessibleMemberIds(user)
  const vaccine = await vaccinesRepository.findByIdScoped(id, memberIds)
  if (!vaccine) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Vacina não encontrada' })
  }
  return vaccine
}

async function getVaccineForRead(user: AuthUser, id: string) {
  if (FAMILY_WRITER_ROLES.includes(user.role)) {
    return getScopedOrThrow(user, id)
  }

  const vaccine = await vaccinesRepository.findById(id)
  if (!vaccine) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Vacina não encontrada' })
  }
  await assertClinicalReadAccess(user, vaccine.memberId, {
    action: 'VIEW_VACCINE_DOSES',
    targetType: 'Vaccine',
  })
  return vaccine
}
