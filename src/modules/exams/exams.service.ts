import {
  assertActiveMedicalAccessGrant,
  assertClinicalReadAccess,
  assertMemberInScope,
  isFamilyRole,
  resolveAccessibleMemberIds,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { examsRepository } from './exams.repository.js'
import type { CreateExamInput, UpdateExamInput } from './exams.schema.js'

export const examsService = {
  async list(user: AuthUser, memberId: string) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_EXAMS',
      targetType: 'FamilyMember',
    })
    return examsRepository.findManyByMemberIds([memberId])
  },

  async create(user: AuthUser, input: CreateExamInput) {
    await assertExamWriteAccess(user, input.memberId)
    const { memberId, ...data } = input
    // Exame registrado pelo médico é sempre marcado como origem DOCTOR,
    // independente do que o client tenha enviado.
    const source = user.role === 'DOCTOR' ? 'DOCTOR' : data.source
    return examsRepository.create(memberId, { ...data, source })
  },

  async update(user: AuthUser, id: string, input: UpdateExamInput) {
    const exam = await getScopedForWrite(user, id)
    return examsRepository.update(exam.id, input)
  },

  async remove(user: AuthUser, id: string) {
    const exam = await getScopedForWrite(user, id)
    await examsRepository.delete(exam.id)
  },
}

// Escritores: família (via escopo) ou DOCTOR com grant ativo. CLINIC_ADMIN só lê.
async function assertExamWriteAccess(user: AuthUser, memberId: string) {
  if (isFamilyRole(user.role)) {
    await assertMemberInScope(user, memberId)
    return
  }
  if (user.role === 'DOCTOR') {
    await assertActiveMedicalAccessGrant({ user, memberId })
    return
  }
  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode registrar exames' })
}

async function getScopedForWrite(user: AuthUser, id: string) {
  if (isFamilyRole(user.role)) {
    const memberIds = await resolveAccessibleMemberIds(user)
    const exam = await examsRepository.findByIdScoped(id, memberIds)
    if (!exam) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Exame não encontrado' })
    }
    return exam
  }

  if (user.role === 'DOCTOR') {
    const exam = await examsRepository.findById(id)
    if (!exam) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Exame não encontrado' })
    }
    await assertActiveMedicalAccessGrant({ user, memberId: exam.memberId })
    return exam
  }

  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode alterar exames' })
}
