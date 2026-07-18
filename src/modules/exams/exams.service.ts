import {
  assertActiveMedicalAccessGrant,
  assertClinicalReadAccess,
  assertOwnScopedMemberInScope,
  isFamilyRole,
  resolveDoctorId,
  resolveOwnScopedMemberIds,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import {
  resolveFamilyAdminUserIds,
  resolveFamilyIdForMember,
  resolveMemberUserId,
  sendPushToUser,
} from '../../shared/push/index.js'
import { decryptField, encryptField } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { examsRepository } from './exams.repository.js'
import type { CreateExamInput, UpdateExamInput } from './exams.schema.js'

export const examsService = {
  async list(user: AuthUser, memberId: string) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_EXAMS',
      targetType: 'FamilyMember',
    })
    const exams = await examsRepository.findManyByMemberIds([memberId])
    return exams.map(toResponse)
  },

  async create(user: AuthUser, input: CreateExamInput) {
    await assertExamWriteAccess(user, input.memberId)
    const { memberId, observations, ...data } = input
    // Exame registrado pelo médico é sempre marcado como origem DOCTOR,
    // independente do que o client tenha enviado. doctorId fica registrado pra
    // contar "exames enviados" na aba Atividade (ver doctors.service.ts).
    const source = user.role === 'DOCTOR' ? 'DOCTOR' : data.source
    const exam = await examsRepository.create(memberId, {
      ...data,
      source,
      ...(observations !== undefined && { observationsEncrypted: encryptField(observations) }),
      ...(user.role === 'DOCTOR' && { doctorId: await resolveDoctorId(user.id) }),
    })

    // CAREGIVER conta como papel de família aqui (ver isFamilyRole) — só DOCTOR é
    // um terceiro de verdade "enviando" algo pra família.
    if (user.role === 'DOCTOR') {
      const familyId = await resolveFamilyIdForMember(memberId)
      const adminUserIds = familyId ? await resolveFamilyAdminUserIds(familyId) : []
      for (const adminUserId of adminUserIds) {
        await sendPushToUser(adminUserId, {
          title: 'Novo exame recebido',
          body: `Um médico enviou o exame "${exam.name}".`,
          data: { type: 'exam-shared', examId: exam.id, memberId },
        })
      }
    } else if (isFamilyRole(user.role)) {
      // Avisa o dono do exame quando ele tem login próprio (FAMILY_MEMBER) e não foi
      // ele mesmo quem cadastrou — dependente sem login (userId null) não recebe nada.
      const ownerUserId = await resolveMemberUserId(memberId)
      if (ownerUserId && ownerUserId !== user.id) {
        await sendPushToUser(ownerUserId, {
          title: 'Novo exame cadastrado',
          body: `Um novo exame "${exam.name}" foi cadastrado para você.`,
          data: { type: 'exam-added', examId: exam.id, memberId },
        })
      }
    }

    return toResponse(exam)
  },

  async update(user: AuthUser, id: string, input: UpdateExamInput) {
    const exam = await getScopedForUpdate(user, id)
    const { observations, ...data } = input
    const updated = await examsRepository.update(exam.id, {
      ...data,
      ...(observations !== undefined && { observationsEncrypted: encryptField(observations) }),
    })
    return toResponse(updated)
  },

  async remove(user: AuthUser, id: string) {
    const exam = await getScopedForDelete(user, id)
    await examsRepository.delete(exam.id)
  },
}

function toResponse(exam: {
  observationsEncrypted: Uint8Array | null
  [key: string]: unknown
}) {
  const { observationsEncrypted, ...rest } = exam
  return {
    ...rest,
    observations: observationsEncrypted ? decryptField(observationsEncrypted) : null,
  }
}

// Escritores: família (via escopo) ou DOCTOR com grant ativo. CLINIC_ADMIN só lê.
async function assertExamWriteAccess(user: AuthUser, memberId: string) {
  if (isFamilyRole(user.role)) {
    await assertOwnScopedMemberInScope(user, memberId)
    return
  }
  if (user.role === 'DOCTOR') {
    await assertActiveMedicalAccessGrant({ user, memberId })
    return
  }
  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode registrar exames' })
}

// Editar exame: FAMILY_MEMBER pode, restrito ao próprio membro (ver resolveOwnScopedMemberIds).
async function getScopedForUpdate(user: AuthUser, id: string) {
  if (isFamilyRole(user.role)) {
    const memberIds = await resolveOwnScopedMemberIds(user)
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
    const doctorId = await resolveDoctorId(user.id)
    if (exam.doctorId !== doctorId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas o médico autor pode editar este exame',
      })
    }
    return exam
  }

  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode alterar exames' })
}

// Excluir exame: ação administrativa — FAMILY_MEMBER nunca pode, nem o próprio.
async function getScopedForDelete(user: AuthUser, id: string) {
  if (user.role === 'FAMILY_MEMBER') {
    throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode excluir exames' })
  }

  if (isFamilyRole(user.role)) {
    const memberIds = await resolveOwnScopedMemberIds(user)
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
    const doctorId = await resolveDoctorId(user.id)
    if (exam.doctorId !== doctorId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas o médico autor pode excluir este exame',
      })
    }
    return exam
  }

  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode excluir exames' })
}
