import { Expo, type ExpoPushMessage } from 'expo-server-sdk'

import { db } from '../../config/database.js'

const expo = new Expo()

export type PushPayload = {
  title: string
  body: string
  data?: Record<string, unknown>
}

/** Envia pra todos os devices registrados do usuário — falha de envio não deve
 * derrubar o fluxo principal que a chamou (ex.: registrar dose), só loga. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const tokens = await db.pushToken.findMany({ where: { userId } })
  const messages: ExpoPushMessage[] = tokens
    .filter((t) => Expo.isExpoPushToken(t.token))
    .map((t) => ({
      to: t.token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }))
  if (messages.length === 0) return

  const chunks = expo.chunkPushNotifications(messages)
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk)
    } catch (err) {
      console.error('[push] falha ao enviar notificação', err)
    }
  }
}

// Retorna todos os admins (>1 é comum desde que promover/rebaixar sincroniza
// User.role — ver families.service.ts:updateMember), não só o primeiro.
export async function resolveFamilyAdminUserIds(familyId: string): Promise<string[]> {
  const admins = await db.familyMember.findMany({
    where: { familyId, isAdmin: true },
    select: { userId: true },
  })
  return admins.map((a) => a.userId).filter((id): id is string => id !== null)
}

// Cuidador é vinculado à família inteira (CaregiverAccess), não a um membro
// específico — diferente de FamilyMember.isAdmin. Nenhuma notificação do
// sistema alcançava cuidadores antes deste resolver.
export async function resolveFamilyCaregiverUserIds(familyId: string): Promise<string[]> {
  const accesses = await db.caregiverAccess.findMany({
    where: { familyId, status: 'ACTIVE' },
    select: { caregiverId: true },
  })
  return accesses.map((a) => a.caregiverId)
}

export async function resolveFamilyIdForMember(memberId: string): Promise<string | null> {
  const member = await db.familyMember.findUnique({
    where: { id: memberId },
    select: { familyId: true },
  })
  return member?.familyId ?? null
}

/** userId do FamilyMember, se ele tiver login próprio (null para dependente sem login). */
export async function resolveMemberUserId(memberId: string): Promise<string | null> {
  const member = await db.familyMember.findUnique({
    where: { id: memberId },
    select: { userId: true },
  })
  return member?.userId ?? null
}
