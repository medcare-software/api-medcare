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

export async function resolveFamilyAdminUserId(familyId: string): Promise<string | null> {
  const admin = await db.familyMember.findFirst({
    where: { familyId, isAdmin: true },
    select: { userId: true },
  })
  return admin?.userId ?? null
}

export async function resolveFamilyIdForMember(memberId: string): Promise<string | null> {
  const member = await db.familyMember.findUnique({
    where: { id: memberId },
    select: { familyId: true },
  })
  return member?.familyId ?? null
}
