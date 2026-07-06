import { env } from '../../config/env.js'
import { db } from '../../config/database.js'
import { resolveFamilyAdminUserId, resolveFamilyIdForMember, sendPushToUser } from '../push/index.js'

/** Roda uma vez por dia (ver server.ts) — avisa a admin da família quando um acesso
 * concedido (médico/clínica ou cuidador) está perto de expirar. `notifiedExpiringAt`
 * evita reenviar o mesmo aviso todo dia até o acesso de fato expirar/ser renovado. */
export async function checkExpiringAccessJob(): Promise<void> {
  const now = new Date()
  const soon = new Date(now.getTime() + env.ACCESS_EXPIRING_SOON_DAYS * 24 * 60 * 60_000)

  const grants = await db.medicalAccessGrant.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { not: null, gte: now, lte: soon },
      notifiedExpiringAt: null,
    },
  })
  for (const grant of grants) {
    const familyId = await resolveFamilyIdForMember(grant.memberId)
    const adminUserId = familyId ? await resolveFamilyAdminUserId(familyId) : null
    if (adminUserId) {
      await sendPushToUser(adminUserId, {
        title: 'Acesso médico expirando',
        body: 'Um acesso concedido a um profissional de saúde expira em breve.',
        data: { type: 'medical-access-expiring', grantId: grant.id },
      })
    }
    await db.medicalAccessGrant.update({
      where: { id: grant.id },
      data: { notifiedExpiringAt: now },
    })
  }

  const invites = await db.caregiverInvite.findMany({
    where: {
      status: { in: ['PENDING', 'ACTIVE'] },
      expiresAt: { gte: now, lte: soon },
      notifiedExpiringAt: null,
    },
  })
  for (const invite of invites) {
    const adminUserId = await resolveFamilyAdminUserId(invite.familyId)
    if (adminUserId) {
      await sendPushToUser(adminUserId, {
        title: 'Acesso de cuidador expirando',
        body: `O acesso de ${invite.email} expira em breve.`,
        data: { type: 'caregiver-access-expiring', inviteId: invite.id },
      })
    }
    await db.caregiverInvite.update({
      where: { id: invite.id },
      data: { notifiedExpiringAt: now },
    })
  }
}
