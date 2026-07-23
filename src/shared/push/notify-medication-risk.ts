import type { Medication } from '@prisma/client'

import {
  resolveFamilyAdminUserIds,
  resolveFamilyCaregiverUserIds,
  resolveFamilyIdForMember,
  resolveMemberUserId,
  sendPushToUser,
} from './push.service.js'

// Regra única de notificação para "medicamento cadastrado com risco reconhecido":
// destinatários = admins da família ∪ cuidadores ativos ∪ o próprio membro/paciente
// (se tiver login) — menos quem executou a ação (já viu o modal e confirmou).
// Cobre os 4 cenários pedidos sem casos especiais por papel: médico cadastra →
// avisa admin(s) + paciente; cuidador cadastra → avisa admin(s) + paciente;
// familiar cadastra pra si mesmo → avisa admin(s) + cuidador(es); admin cadastra
// → avisa outros admins + cuidador(es) + paciente.
export async function notifyMedicationRiskAcknowledged(params: {
  medication: Pick<Medication, 'id' | 'name' | 'memberId'>
  actorUserId: string
}): Promise<void> {
  const { medication, actorUserId } = params
  const familyId = await resolveFamilyIdForMember(medication.memberId)
  if (!familyId) return

  const [adminUserIds, caregiverUserIds, memberUserId] = await Promise.all([
    resolveFamilyAdminUserIds(familyId),
    resolveFamilyCaregiverUserIds(familyId),
    resolveMemberUserId(medication.memberId),
  ])

  const recipientIds = new Set<string>([...adminUserIds, ...caregiverUserIds])
  if (memberUserId) recipientIds.add(memberUserId)
  recipientIds.delete(actorUserId)

  for (const userId of recipientIds) {
    await sendPushToUser(userId, {
      title: 'Risco de interação medicamentosa',
      body: `${medication.name} foi cadastrado mesmo após um aviso de risco.`,
      data: {
        type: 'medication-interaction-risk',
        medicationId: medication.id,
        memberId: medication.memberId,
      },
    })
  }
}
