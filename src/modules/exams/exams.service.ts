import { db } from '../../config/database.js'
import {
  assertActiveMedicalAccessGrant,
  assertClinicalProfileComplete,
  assertClinicalReadAccess,
  assertOwnScopedMemberInScope,
  isFamilyRole,
  resolveClinicId,
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
    // Exame registrado por médico/clínica é sempre marcado com a origem
    // correspondente, independente do que o client tenha enviado. doctorId/
    // clinicId ficam registrados pra contar "exames enviados" nos relatórios.
    const source =
      user.role === 'DOCTOR' ? 'DOCTOR' : user.role === 'CLINIC_ADMIN' ? 'CLINIC' : data.source
    const exam = await examsRepository.create(memberId, {
      ...data,
      source,
      ...(observations !== undefined && { observationsEncrypted: encryptField(observations) }),
      ...(user.role === 'DOCTOR' && { doctorId: await resolveDoctorId(user.id) }),
      ...(user.role === 'CLINIC_ADMIN' && { clinicId: await resolveClinicId(user.id) }),
    })

    // CAREGIVER conta como papel de família aqui (ver isFamilyRole) — só DOCTOR/
    // CLINIC_ADMIN são terceiros de verdade "enviando" algo pra família.
    if (user.role === 'DOCTOR' || user.role === 'CLINIC_ADMIN') {
      const familyId = await resolveFamilyIdForMember(memberId)
      const adminUserIds = familyId ? await resolveFamilyAdminUserIds(familyId) : []
      const senderLabel = user.role === 'DOCTOR' ? 'Um médico' : 'Uma clínica'
      for (const adminUserId of adminUserIds) {
        await sendPushToUser(adminUserId, {
          title: 'Novo exame recebido',
          body: `${senderLabel} enviou o exame "${exam.name}".`,
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

// Escritores: família (via escopo), DOCTOR ou CLINIC_ADMIN com grant ativo.
// CLINIC_ADMIN só pode enviar exame se a clínica tiver e-mail cadastrado em
// configurações — é o canal usado pra devolver laudo/contato ao paciente.
async function assertExamWriteAccess(user: AuthUser, memberId: string) {
  if (isFamilyRole(user.role)) {
    await assertOwnScopedMemberInScope(user, memberId)
    await assertClinicalProfileComplete(memberId)
    return
  }
  if (user.role === 'DOCTOR') {
    await assertActiveMedicalAccessGrant({ user, memberId })
    return
  }
  if (user.role === 'CLINIC_ADMIN') {
    const clinicId = await resolveClinicId(user.id)
    const clinic = await db.clinic.findUnique({ where: { id: clinicId }, select: { email: true } })
    if (!clinic?.email) {
      throw new AppError({
        code: 'CLINIC_EMAIL_REQUIRED',
        message: 'Cadastre um e-mail nas configurações da clínica antes de enviar exames.',
      })
    }
    await assertActiveMedicalAccessGrant({ user, memberId })
    return
  }
  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode registrar exames' })
}

// Editar exame: família só altera exame MANUAL (criado pelo paciente); demais origens são read-only.
async function getScopedForUpdate(user: AuthUser, id: string) {
  if (isFamilyRole(user.role)) {
    const memberIds = await resolveOwnScopedMemberIds(user)
    const exam = await examsRepository.findByIdScoped(id, memberIds)
    if (!exam) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Exame não encontrado' })
    }
    if (exam.source !== 'MANUAL') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Só é possível alterar exames adicionados manualmente',
      })
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

  if (user.role === 'CLINIC_ADMIN') {
    const exam = await examsRepository.findById(id)
    if (!exam) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Exame não encontrado' })
    }
    await assertActiveMedicalAccessGrant({ user, memberId: exam.memberId })
    const clinicId = await resolveClinicId(user.id)
    if (exam.clinicId !== clinicId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas a clínica autora pode editar este exame',
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
    if (exam.source !== 'MANUAL') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Só é possível excluir exames adicionados manualmente',
      })
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

  if (user.role === 'CLINIC_ADMIN') {
    const exam = await examsRepository.findById(id)
    if (!exam) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Exame não encontrado' })
    }
    await assertActiveMedicalAccessGrant({ user, memberId: exam.memberId })
    const clinicId = await resolveClinicId(user.id)
    if (exam.clinicId !== clinicId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas a clínica autora pode excluir este exame',
      })
    }
    return exam
  }

  throw new AppError({ code: 'FORBIDDEN', message: 'Perfil não pode excluir exames' })
}
