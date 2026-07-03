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
}
