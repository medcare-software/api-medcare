import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'
import type { UpsertNotificationPreferenceInput } from './notifications.schema.js'

export const notificationsRepository = {
  findManyByUserId(userId: string) {
    return db.notificationPreference.findMany({ where: { userId } })
  },

  upsert(userId: string, input: UpsertNotificationPreferenceInput) {
    return db.notificationPreference.upsert({
      where: {
        userId_channel_category: { userId, channel: input.channel, category: input.category },
      },
      create: omitUndefined({
        userId,
        channel: input.channel,
        category: input.category,
        enabled: input.enabled,
        reminderMinutesBefore: input.reminderMinutesBefore,
      }),
      update: omitUndefined({
        enabled: input.enabled,
        reminderMinutesBefore: input.reminderMinutesBefore,
      }),
    })
  },

  findByIdScoped(id: string, userId: string) {
    return db.notificationPreference.findFirst({ where: { id, userId } })
  },

  deleteScoped(id: string, userId: string) {
    return db.notificationPreference.deleteMany({ where: { id, userId } })
  },

  // upsert por token: o mesmo device pode trocar de conta (logout/login) sem deixar
  // token órfão apontando pro usuário anterior.
  upsertPushToken(userId: string, token: string, platform: string) {
    return db.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    })
  },
}
