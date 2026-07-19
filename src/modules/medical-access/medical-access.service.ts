import crypto from 'node:crypto'

import type { AccessStatus } from '@prisma/client'
import { db } from '../../config/database.js'
import { env } from '../../config/env.js'
import {
  assertMemberInScope,
  resolveAccessibleMemberIds,
  resolveClinicId,
  resolveDoctorId,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { sendPushToUser } from '../../shared/push/index.js'
import { hashForLookup } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { medicalAccessRepository } from './medical-access.repository.js'
import type {
  CheckGrantInput,
  CreateGrantInput,
  RedeemGrantInput,
} from './medical-access.schema.js'

// Valida o código (existe, não expirado, não já usado/revogado) sem consumi-lo
// — usado tanto por checkCode (validação prévia, antes de escolher o médico)
// quanto por redeem (que ativa o grant em seguida).
async function findValidGrantByCode(code: string) {
  const codeHash = hashForLookup(code)
  const grant = await medicalAccessRepository.findByCodeHash(codeHash)
  if (!grant) {
    throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
  }
  if (grant.status === 'ACTIVE' || grant.status === 'REVOKED') {
    throw new AppError({ code: 'CONFLICT', message: 'Código já utilizado ou revogado' })
  }
  if (grant.status === 'EXPIRED' || (grant.expiresAt !== null && grant.expiresAt < new Date())) {
    if (grant.status !== 'EXPIRED') {
      await medicalAccessRepository.markExpired(grant.id)
    }
    throw new AppError({ code: 'ACCESS_CODE_EXPIRED', message: 'Código expirado' })
  }
  return grant
}

export const medicalAccessService = {
  // Validação prévia (não consome o código) — usada pela clínica antes de
  // avançar para a seleção do médico responsável, dando feedback imediato de
  // código inválido/expirado/já usado sem precisar escolher médico primeiro.
  async checkCode(input: CheckGrantInput) {
    await findValidGrantByCode(input.code)
  },

  async createGrant(user: AuthUser, input: CreateGrantInput) {
    await assertMemberInScope(user, input.memberId)

    const code = String(crypto.randomInt(100000, 1000000))
    const codeHash = hashForLookup(code)
    const expiresAt = new Date(Date.now() + env.MEDICAL_ACCESS_CODE_TTL_MINUTES * 60_000)

    const grant = await medicalAccessRepository.create({
      memberId: input.memberId,
      codeHash,
      validity: input.validity,
      ...(input.temporaryDays !== undefined && { temporaryDays: input.temporaryDays }),
      expiresAt,
    })

    // Confirmação pra quem concedeu — o model é anônimo até o resgate (o código ainda
    // não tem um médico/cuidador associado), então o conteúdo referencia o membro, não
    // "quem recebeu" (isso só se sabe depois que o código for resgatado).
    const member = await db.familyMember.findUnique({
      where: { id: input.memberId },
      select: { displayName: true },
    })
    await sendPushToUser(user.id, {
      title: 'Acesso concedido',
      body: `Código de acesso gerado para ${member?.displayName ?? 'um membro da família'}.`,
      data: { type: 'medical-access-granted', grantId: grant.id },
    })

    // Código em texto plano só existe nesta resposta — nunca é persistido (só codeHash acima).
    return { id: grant.id, code, expiresAt: grant.expiresAt, validity: grant.validity }
  },

  async redeem(user: AuthUser, input: RedeemGrantInput) {
    const grant = await findValidGrantByCode(input.code)

    const isDoctor = user.role === 'DOCTOR'
    const doctorId = isDoctor ? await resolveDoctorId(user.id) : undefined
    const clinicId = isDoctor ? undefined : await resolveClinicId(user.id)

    // Clínica pode, no ato do resgate, já atribuir um médico interno responsável —
    // precisa estar vinculado e ativo à própria clínica. Isso já concede acesso real
    // a esse médico via o mesmo grant (ver assertActiveMedicalAccessGrant, branch DOCTOR).
    let assignedDoctorId: string | undefined
    if (!isDoctor && input.doctorId) {
      const link = await db.clinicDoctorLink.findUnique({
        where: { clinicId_doctorId: { clinicId: clinicId as string, doctorId: input.doctorId } },
      })
      if (!link?.active) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'Médico não vinculado a esta clínica',
        })
      }
      assignedDoctorId = input.doctorId
    }

    // expiresAt tem significado duplo neste model: até aqui era o prazo de resgate
    // do código; a partir daqui vira o prazo do acesso clínico em si.
    const temporaryDays = grant.temporaryDays ?? env.MEDICAL_ACCESS_TEMPORARY_GRANT_DAYS
    const newExpiresAt =
      grant.validity === 'PERMANENT'
        ? null
        : new Date(Date.now() + temporaryDays * 24 * 60 * 60_000)

    const activated = await medicalAccessRepository.activate(grant.id, {
      ...(doctorId !== undefined && { doctorId }),
      ...(assignedDoctorId !== undefined && { doctorId: assignedDoctorId }),
      ...(clinicId !== undefined && { clinicId }),
      grantedAt: new Date(),
      expiresAt: newExpiresAt,
    })
    return omitCodeHash(activated)
  },

  async listMine(user: AuthUser) {
    const memberIds = await resolveAccessibleMemberIds(user)
    const grants = await medicalAccessRepository.findManyByMemberIds(memberIds)
    return grants.map(omitCodeHash)
  },

  async revoke(user: AuthUser, id: string) {
    const memberIds = await resolveAccessibleMemberIds(user)
    const grant = await medicalAccessRepository.findByIdScoped(id, memberIds)
    if (!grant) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Grant não encontrado' })
    }
    await medicalAccessRepository.revoke(grant.id)
  },

  async listHeld(user: AuthUser, status?: AccessStatus) {
    if (user.role === 'DOCTOR') {
      const doctorId = await resolveDoctorId(user.id)
      const grants = await medicalAccessRepository.findManyHeldByDoctor(doctorId, status)
      return grants.map(omitCodeHash)
    }
    const clinicId = await resolveClinicId(user.id)
    const grants = await medicalAccessRepository.findManyHeldByClinic(clinicId, status)
    return grants.map(omitCodeHash)
  },
}

// codeHash nunca deve sair da API — não é reversível, mas não há motivo para expô-lo.
function omitCodeHash<T extends { codeHash: string }>(grant: T): Omit<T, 'codeHash'> {
  const { codeHash: _codeHash, ...rest } = grant
  return rest
}
