import type { Role } from '@prisma/client'
import { Prisma } from '@prisma/client'

import { db } from '../../config/database.js'
import { env } from '../../config/env.js'
import {
  assertClinicalReadAccess,
  assertOwnScopedMemberInScope,
  resolveOwnScopedMemberIds,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import {
  notifyMedicationRiskAcknowledged,
  resolveFamilyAdminUserIds,
  resolveFamilyCaregiverUserIds,
  resolveFamilyIdForMember,
  sendPushToUser,
} from '../../shared/push/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { medicationsRepository } from './medications.repository.js'
import type {
  CreateMedicationInput,
  RecordDoseInput,
  UpdateMedicationInput,
} from './medications.schema.js'

const FAMILY_WRITER_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER', 'CAREGIVER']
// Excluir medicação é uma ação administrativa — FAMILY_MEMBER fica de fora
// (diferente de criar/editar/marcar dose, restritos ao próprio membro mas permitidos).
const CLINICAL_DELETE_ROLES: Role[] = ['PATIENT_ADMIN', 'CAREGIVER']

export const medicationsService = {
  async list(user: AuthUser, memberId: string, filters: { active?: boolean }) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_MEDICATIONS',
      targetType: 'FamilyMember',
    })
    return medicationsRepository.findManyByMemberIds([memberId], filters)
  },

  async create(user: AuthUser, input: CreateMedicationInput, idempotencyKey?: string) {
    assertFamilyWriter(user)
    await assertCanManageMedicationCatalog(user, input.memberId)

    if (idempotencyKey) {
      const existing = await medicationsRepository.findByIdempotencyKey(idempotencyKey)
      if (existing) {
        await assertCanManageMedicationCatalog(user, existing.memberId)
        return existing
      }
    }

    const { memberId, ...data } = input
    try {
      const medication = await medicationsRepository.create(memberId, data, idempotencyKey)
      if (medication.riskAcknowledgedAt) {
        // Não bloqueia a resposta HTTP — push lento/falho no Railway virava
        // timeout no app com o medicamento já gravado (duplicata no retry).
        void notifyMedicationRiskAcknowledged({ medication, actorUserId: user.id }).catch(() => {})
      }
      return medication
    } catch (err) {
      // Corrida: dois POSTs com a mesma key — o 2º perde no @unique e devolve o 1º.
      if (
        idempotencyKey &&
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'P2002'
      ) {
        const existing = await medicationsRepository.findByIdempotencyKey(idempotencyKey)
        if (existing) return existing
      }
      throw err
    }
  },

  async update(user: AuthUser, id: string, input: UpdateMedicationInput) {
    assertFamilyWriter(user)
    const medication = await getScopedOrThrow(user, id)
    await assertCanManageMedicationCatalog(user, medication.memberId)
    const updated = await medicationsRepository.update(medication.id, input)
    // Reabasteceu acima do limite — libera o próximo aviso de estoque baixo.
    if (
      input.stockQuantity !== undefined &&
      input.stockQuantity > env.MEDICATION_LOW_STOCK_THRESHOLD &&
      medication.lowStockNotifiedAt
    ) {
      await medicationsRepository.resetLowStockNotification(medication.id)
    }
    return updated
  },

  async deactivate(user: AuthUser, id: string, reason: string) {
    assertFamilyDeleter(user)
    const medication = await getScopedOrThrow(user, id)
    await assertCanManageMedicationCatalog(user, medication.memberId)
    await medicationsRepository.deactivate(medication.id, reason)
  },

  async recordDose(user: AuthUser, medicationId: string, input: RecordDoseInput) {
    assertFamilyWriter(user)
    const medication = await getScopedOrThrow(user, medicationId)
    let dose
    try {
      dose = await medicationsRepository.createDoseRecord(medication.id, {
        ...input,
        recordedById: user.id,
      })
    } catch (err) {
      // Retry após timeout: unique (medicationId, scheduledAt) — devolve a dose já gravada.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await medicationsRepository.findDoseRecordByScheduledAt(
          medication.id,
          input.scheduledAt,
        )
        if (existing) return existing
      }
      throw err
    }

    if (
      input.state === 'TAKEN' &&
      medication.stockQuantity !== null &&
      medication.stockQuantity > 0
    ) {
      const newStock = medication.stockQuantity - 1
      const crossedThreshold =
        newStock <= env.MEDICATION_LOW_STOCK_THRESHOLD && !medication.lowStockNotifiedAt
      await medicationsRepository.decrementStock(medication.id, newStock, crossedThreshold)

      if (crossedThreshold) {
        const familyId = await resolveFamilyIdForMember(medication.memberId)
        const [adminUserIds, caregiverUserIds] = familyId
          ? await Promise.all([
              resolveFamilyAdminUserIds(familyId),
              resolveFamilyCaregiverUserIds(familyId),
            ])
          : [[], []]
        // Inclui quem registrou a dose — senão o próprio paciente/admin da
        // sessão pode não receber se a resolução de família falhar/atrasar.
        const recipientIds = [
          ...new Set([...adminUserIds, ...caregiverUserIds, user.id]),
        ]
        const title = newStock <= 0 ? 'Estoque esgotado' : 'Estoque acabando'
        const body =
          newStock <= 0
            ? `${medication.name} acabou. Reponha o estoque.`
            : `${medication.name} está acabando (${newStock} restante${
                newStock === 1 ? '' : 's'
              }).`
        for (const recipientId of recipientIds) {
          await sendPushToUser(recipientId, {
            title,
            body,
            data: {
              type: 'medication-low-stock',
              medicationId: medication.id,
              memberId: medication.memberId,
            },
          })
        }
      }
    }

    return dose
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

/** Cadastro/edição/exclusão: só na família própria (FamilyMember). CaregiverAccess → só dose. */
async function assertCanManageMedicationCatalog(user: AuthUser, memberId: string) {
  await assertOwnScopedMemberInScope(user, memberId)

  const [ownFamily, target] = await Promise.all([
    db.familyMember.findUnique({
      where: { userId: user.id },
      select: { familyId: true },
    }),
    db.familyMember.findUnique({
      where: { id: memberId },
      select: { familyId: true },
    }),
  ])

  if (!target) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Registro não encontrado' })
  }

  if (ownFamily?.familyId === target.familyId) {
    return
  }

  throw new AppError({
    code: 'FORBIDDEN',
    message: 'Cuidador não pode cadastrar medicamentos',
  })
}

function assertFamilyDeleter(user: AuthUser) {
  if (!CLINICAL_DELETE_ROLES.includes(user.role)) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode excluir medicações' })
  }
}

async function getScopedOrThrow(user: AuthUser, id: string) {
  const memberIds = await resolveOwnScopedMemberIds(user)
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
