import { AppError } from '../../shared/errors/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { notificationsRepository } from './notifications.repository.js'
import type {
  RegisterPushTokenInput,
  UpsertNotificationPreferenceInput,
} from './notifications.schema.js'

export const notificationsService = {
  async list(user: AuthUser) {
    return notificationsRepository.findManyByUserId(user.id)
  },

  async upsert(user: AuthUser, input: UpsertNotificationPreferenceInput) {
    return notificationsRepository.upsert(user.id, input)
  },

  async remove(user: AuthUser, id: string) {
    const result = await notificationsRepository.deleteScoped(id, user.id)
    if (result.count === 0) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Preferência não encontrada' })
    }
  },

  async registerPushToken(user: AuthUser, input: RegisterPushTokenInput) {
    await notificationsRepository.upsertPushToken(user.id, input.token, input.platform)
  },
}
