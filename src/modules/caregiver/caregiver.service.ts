import crypto from 'node:crypto'

import { env } from '../../config/env.js'
import { assertFamilyInScope } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { caregiverInviteCodeTemplate, sendMail } from '../../shared/mail/index.js'
import { sendPushToUser } from '../../shared/push/index.js'
import { hashForLookup } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { caregiverRepository } from './caregiver.repository.js'
import type { CreateCaregiverInviteInput, RedeemCaregiverInviteInput } from './caregiver.schema.js'

export const caregiverService = {
  // Só PATIENT_ADMIN convida — reforça a mesma regra de escrita de families.service.
  async createInvite(user: AuthUser, familyId: string, input: CreateCaregiverInviteInput) {
    assertFamilyAdmin(user)
    await assertFamilyInScope(user, familyId)

    const family = await caregiverRepository.findFamilyById(familyId)
    if (!family) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Família não encontrada' })
    }

    const code = String(crypto.randomInt(100000, 1000000))
    const codeHash = hashForLookup(code)
    const expiresAt = new Date(Date.now() + env.CAREGIVER_INVITE_CODE_TTL_MINUTES * 60_000)

    const invite = await caregiverRepository.createInvite({
      familyId,
      email: input.email.toLowerCase(),
      codeHash,
      expiresAt,
    })

    const template = caregiverInviteCodeTemplate(
      code,
      env.CAREGIVER_INVITE_CODE_TTL_MINUTES,
      family.name,
    )
    await sendMail({ to: invite.email, ...template })

    // Confirmação pra quem concedeu — aqui já se sabe o e-mail do destinatário
    // (diferente do medical-access, que é anônimo até o resgate).
    await sendPushToUser(user.id, {
      title: 'Acesso concedido',
      body: `Convite de cuidador enviado para ${invite.email}.`,
      data: { type: 'caregiver-access-granted', inviteId: invite.id },
    })

    return { id: invite.id, email: invite.email, expiresAt: invite.expiresAt }
  },

  async listInvites(user: AuthUser, familyId: string) {
    assertFamilyAdmin(user)
    await assertFamilyInScope(user, familyId)
    const invites = await caregiverRepository.findManyInvitesByFamilyId(familyId)
    return invites.map(omitCodeHash)
  },

  async revokeInvite(user: AuthUser, familyId: string, id: string) {
    assertFamilyAdmin(user)
    await assertFamilyInScope(user, familyId)
    const invite = await caregiverRepository.findInviteByIdScoped(id, familyId)
    if (!invite) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Convite não encontrado' })
    }
    await caregiverRepository.revokeInvite(invite.id)
  },

  // Resgatado pelo cuidador autenticado — não exige que o e-mail do convite bata
  // com o e-mail da conta, mesmo padrão do medical-access (o código já é o segredo).
  async redeem(user: AuthUser, input: RedeemCaregiverInviteInput) {
    const codeHash = hashForLookup(input.code)
    const invite = await caregiverRepository.findInviteByCodeHash(codeHash)
    if (!invite) {
      throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
    }
    if (invite.status === 'ACTIVE' || invite.status === 'REVOKED') {
      throw new AppError({ code: 'CONFLICT', message: 'Código já utilizado ou revogado' })
    }
    if (invite.status === 'EXPIRED' || invite.expiresAt < new Date()) {
      if (invite.status !== 'EXPIRED') {
        await caregiverRepository.markInviteExpired(invite.id)
      }
      throw new AppError({ code: 'ACCESS_CODE_EXPIRED', message: 'Código expirado' })
    }

    const existingAccess = await caregiverRepository.findCaregiverAccess(user.id, invite.familyId)
    await caregiverRepository.activateCaregiverAccess(
      user.id,
      invite.familyId,
      existingAccess?.id,
    )
    const redeemed = await caregiverRepository.markInviteRedeemed(invite.id)

    const family = await caregiverRepository.findFamilyById(invite.familyId)
    return { familyId: invite.familyId, familyName: family?.name ?? '', expiresAt: redeemed.expiresAt }
  },

  async listMyFamilies(user: AuthUser) {
    const accesses = await caregiverRepository.findFamiliesForCaregiver(user.id)
    return accesses.map((access) => ({
      familyId: access.familyId,
      familyName: access.family.name,
      grantedAt: access.grantedAt,
      expiresAt: access.expiresAt,
    }))
  },
}

function assertFamilyAdmin(user: AuthUser) {
  if (user.role !== 'PATIENT_ADMIN') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Perfil não pode gerenciar cuidadores da família',
    })
  }
}

function omitCodeHash<T extends { codeHash: string }>(invite: T): Omit<T, 'codeHash'> {
  const { codeHash: _codeHash, ...rest } = invite
  return rest
}
