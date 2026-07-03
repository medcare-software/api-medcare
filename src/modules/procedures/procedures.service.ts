import {
  assertClinicalReadAccess,
  assertClinicalWriteAccess,
  resolveDoctorId,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
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
    })
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

    const updated = await proceduresRepository.update(id, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.performedAt !== undefined && { performedAt: input.performedAt }),
      ...(input.description !== undefined && {
        descriptionEncrypted: encryptField(input.description),
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
  performedAt: Date
  createdAt: Date
}) {
  return {
    id: procedure.id,
    memberId: procedure.memberId,
    doctorId: procedure.doctorId,
    title: procedure.title,
    status: procedure.status,
    description: procedure.descriptionEncrypted
      ? decryptField(procedure.descriptionEncrypted)
      : null,
    performedAt: procedure.performedAt,
    createdAt: procedure.createdAt,
  }
}
