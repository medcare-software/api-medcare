import {
  assertClinicalReadAccess,
  assertClinicalWriteAccess,
  resolveDoctorId,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import {
  resolveFamilyAdminUserIds,
  resolveFamilyIdForMember,
  sendPushToUser,
} from '../../shared/push/index.js'
import { decryptField, encryptField } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { proceduresRepository } from './procedures.repository.js'
import type { CreateProcedureInput, UpdateProcedureInput } from './procedures.schema.js'

export const proceduresService = {
  async list(user: AuthUser, memberId: string) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_PROCEDURES',
      targetType: 'FamilyMember',
    })
    const procedures = await proceduresRepository.findManyByMemberId(memberId)
    return procedures.map(toResponse)
  },

  async getById(user: AuthUser, id: string) {
    const procedure = await proceduresRepository.findById(id)
    if (!procedure) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Procedimento não encontrado' })
    }
    await assertClinicalReadAccess(user, procedure.memberId, {
      action: 'VIEW_PROCEDURE',
      targetType: 'Procedure',
    })
    return toResponse(procedure)
  },

  async create(user: AuthUser, input: CreateProcedureInput) {
    await assertClinicalWriteAccess(user, input.memberId)
    const doctorId = await resolveDoctorId(user.id)
    const procedure = await proceduresRepository.create({
      memberId: input.memberId,
      doctorId,
      title: input.title,
      status: input.status,
      performedAt: input.performedAt,
      ...(input.description !== undefined && {
        descriptionEncrypted: encryptField(input.description),
      }),
      ...(input.observations !== undefined && {
        observationsEncrypted: encryptField(input.observations),
      }),
    })

    const familyId = await resolveFamilyIdForMember(input.memberId)
    const adminUserIds = familyId ? await resolveFamilyAdminUserIds(familyId) : []
    for (const adminUserId of adminUserIds) {
      await sendPushToUser(adminUserId, {
        title: 'Novo procedimento recebido',
        body: `Um médico registrou o procedimento "${procedure.title}".`,
        data: { type: 'procedure-shared', procedureId: procedure.id, memberId: input.memberId },
      })
    }

    return toResponse(procedure)
  },

  async update(user: AuthUser, id: string, input: UpdateProcedureInput) {
    const procedure = await proceduresRepository.findById(id)
    if (!procedure) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Procedimento não encontrado' })
    }

    // Mesma restrição de diagnostics: só o médico autor edita, mesmo que outro
    // médico tenha um grant ativo para o paciente.
    const doctorId = await resolveDoctorId(user.id)
    if (procedure.doctorId !== doctorId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas o médico autor pode editar este procedimento',
      })
    }
    await assertClinicalWriteAccess(user, procedure.memberId)

    // Motivo obrigatório só ao cancelar ou reabrir (COMPLETED -> IN_PROGRESS) —
    // depende do status ATUAL no banco (procedure.status), por isso não dá pra
    // validar isso só com Zod no schema de entrada.
    const isCancelling = input.status === 'CANCELLED'
    const isReopening = input.status === 'IN_PROGRESS' && procedure.status === 'COMPLETED'
    if ((isCancelling || isReopening) && !input.reason) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: isCancelling
          ? 'Motivo do cancelamento é obrigatório'
          : 'Motivo da reabertura é obrigatório',
      })
    }

    const updated = await proceduresRepository.update(id, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.performedAt !== undefined && { performedAt: input.performedAt }),
      ...(input.description !== undefined && {
        descriptionEncrypted: encryptField(input.description),
      }),
      ...(input.observations !== undefined && {
        observationsEncrypted: encryptField(input.observations),
      }),
      ...(input.reason !== undefined && {
        statusChangeReasonEncrypted: encryptField(input.reason),
      }),
    })
    return toResponse(updated)
  },
}

function toResponse(procedure: {
  id: string
  memberId: string
  doctorId: string | null
  title: string
  status: string
  descriptionEncrypted: Uint8Array | null
  observationsEncrypted: Uint8Array | null
  statusChangeReasonEncrypted: Uint8Array | null
  performedAt: Date
  createdAt: Date
  doctor?: { crmNumber: string; crmState: string } | null
}) {
  return {
    id: procedure.id,
    memberId: procedure.memberId,
    doctorId: procedure.doctorId,
    doctorCrm: procedure.doctor
      ? `${procedure.doctor.crmNumber}/${procedure.doctor.crmState}`
      : null,
    title: procedure.title,
    status: procedure.status,
    description: procedure.descriptionEncrypted
      ? decryptField(procedure.descriptionEncrypted)
      : null,
    observations: procedure.observationsEncrypted
      ? decryptField(procedure.observationsEncrypted)
      : null,
    reason: procedure.statusChangeReasonEncrypted
      ? decryptField(procedure.statusChangeReasonEncrypted)
      : null,
    performedAt: procedure.performedAt,
    createdAt: procedure.createdAt,
  }
}
