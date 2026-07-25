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

  async listInbox(user: AuthUser) {
    return notificationsRepository.findInboxByUserId(user.id)
  },

  async markInboxRead(user: AuthUser, id: string) {
    const existing = await notificationsRepository.findInboxByIdScoped(id, user.id)
    if (!existing) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Notificação não encontrada' })
    }
    if (existing.readAt) return
    await notificationsRepository.markInboxReadScoped(id, user.id)
  },

  async markAllInboxRead(user: AuthUser) {
    await notificationsRepository.markAllInboxRead(user.id)
  },

  async removeInbox(user: AuthUser, id: string) {
    const result = await notificationsRepository.softDeleteInboxScoped(id, user.id)
    if (result.count === 0) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Notificação não encontrada' })
    }
  },
}
