import {
  assertClinicalReadAccess,
  assertClinicalWriteAccess,
  resolveDoctorId,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { decryptField, encryptField } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { diagnosticsRepository } from './diagnostics.repository.js'
import type { CreateDiagnosticInput, UpdateDiagnosticInput } from './diagnostics.schema.js'

export const diagnosticsService = {
  async list(user: AuthUser, memberId: string) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_DIAGNOSTICS',
      targetType: 'FamilyMember',
    })
    const diagnostics = await diagnosticsRepository.findManyByMemberId(memberId)
    return diagnostics.map(toResponse)
  },

  async getById(user: AuthUser, id: string) {
    const diagnostic = await diagnosticsRepository.findById(id)
    if (!diagnostic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Diagnóstico não encontrado' })
    }
    await assertClinicalReadAccess(user, diagnostic.memberId, {
      action: 'VIEW_DIAGNOSTIC',
      targetType: 'Diagnostic',
    })
    return toResponse(diagnostic)
  },

  async create(user: AuthUser, input: CreateDiagnosticInput) {
    await assertClinicalWriteAccess(user, input.memberId)
    // doctorId nunca vem do client — deriva sempre do token, para impedir spoofing.
    const doctorId = await resolveDoctorId(user.id)
    const diagnostic = await diagnosticsRepository.create({
      memberId: input.memberId,
      doctorId,
      title: input.title,
      descriptionEncrypted: encryptField(input.description),
      conductEncrypted: encryptField(input.conduct),
      diagnosedAt: input.diagnosedAt,
    })
    return toResponse(diagnostic)
  },

  async update(user: AuthUser, id: string, input: UpdateDiagnosticInput) {
    const diagnostic = await diagnosticsRepository.findById(id)
    if (!diagnostic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Diagnóstico não encontrado' })
    }

    const doctorId = await resolveDoctorId(user.id)
    if (diagnostic.doctorId !== doctorId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas o médico autor pode editar este diagnóstico',
      })
    }
    await assertClinicalWriteAccess(user, diagnostic.memberId)

    const updated = await diagnosticsRepository.update(id, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && {
        descriptionEncrypted: encryptField(input.description),
      }),
      ...(input.conduct !== undefined && { conductEncrypted: encryptField(input.conduct) }),
      ...(input.diagnosedAt !== undefined && { diagnosedAt: input.diagnosedAt }),
    })
    return toResponse(updated)
  },
}

function toResponse(diagnostic: {
  id: string
  memberId: string
  doctorId: string | null
  title: string
  descriptionEncrypted: Uint8Array
  conductEncrypted: Uint8Array
  diagnosedAt: Date
  createdAt: Date
}) {
  return {
    id: diagnostic.id,
    memberId: diagnostic.memberId,
    doctorId: diagnostic.doctorId,
    title: diagnostic.title,
    description: decryptField(diagnostic.descriptionEncrypted),
    conduct: decryptField(diagnostic.conductEncrypted),
    diagnosedAt: diagnostic.diagnosedAt,
    createdAt: diagnostic.createdAt,
  }
}
