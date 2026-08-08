import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors/index.js'
import { recordAuditEvent } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { appForceUpdateRepository } from './app-force-update.repository.js'
import type { ForceUpdatePlatform, PatchForceUpdateInput } from './app-force-update.schema.js'
import {
  fetchAndroidStoreVersion,
  fetchIosStoreVersion,
} from './app-force-update.store-version.js'

const DEFAULT_STORE_URLS: Record<ForceUpdatePlatform, string> = {
  ios: `https://apps.apple.com/app/id${env.APP_STORE_CONNECT_APP_ID}`,
  android: `https://play.google.com/store/apps/details?id=${
    env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || 'com.condev.medcare'
  }`,
}

function toAdminDto(row: {
  platform: string
  latestStoreVersion: string
  forceUpdateEnabled: boolean
  storeUrl: string
  lastFetchedAt: Date | null
  updatedAt: Date
}) {
  return {
    platform: row.platform as ForceUpdatePlatform,
    latestStoreVersion: row.latestStoreVersion,
    forceUpdateEnabled: row.forceUpdateEnabled,
    storeUrl: row.storeUrl,
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toPublicDto(row: {
  platform: string
  latestStoreVersion: string
  forceUpdateEnabled: boolean
  storeUrl: string
}) {
  return {
    platform: row.platform as ForceUpdatePlatform,
    latestStoreVersion: row.latestStoreVersion,
    forceUpdateEnabled: row.forceUpdateEnabled,
    storeUrl: row.storeUrl,
  }
}

export const appForceUpdateService = {
  async ensureDefaults() {
    const existing = await appForceUpdateRepository.findAll()
    const byPlatform = new Map(existing.map((row) => [row.platform, row]))
    for (const platform of ['ios', 'android'] as const) {
      if (!byPlatform.has(platform)) {
        const created = await appForceUpdateRepository.create({
          platform,
          storeUrl: DEFAULT_STORE_URLS[platform],
        })
        byPlatform.set(platform, created)
      }
    }
    return ['ios', 'android'].map((platform) => byPlatform.get(platform)!)
  },

  async listForAdmin() {
    const rows = await this.ensureDefaults()
    return rows.map(toAdminDto)
  },

  async listForApp() {
    const rows = await this.ensureDefaults()
    return rows.map(toPublicDto)
  },

  async patch(actor: AuthUser, platform: ForceUpdatePlatform, input: PatchForceUpdateInput) {
    await this.ensureDefaults()
    const current = await appForceUpdateRepository.findByPlatform(platform)
    if (!current) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Configuração não encontrada' })
    }

    if (input.forceUpdateEnabled && !current.latestStoreVersion.trim()) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message:
          'Atualize a versão da loja antes de forçar a atualização (botão “Atualizar versões da loja”).',
      })
    }

    const updated = await appForceUpdateRepository.update(platform, {
      forceUpdateEnabled: input.forceUpdateEnabled,
    })

    await recordAuditEvent({
      actorId: actor.id,
      action: input.forceUpdateEnabled
        ? 'APP_FORCE_UPDATE_ENABLED'
        : 'APP_FORCE_UPDATE_DISABLED',
      targetType: 'AppForceUpdateConfig',
      targetId: updated.id,
      metadata: { platform, forceUpdateEnabled: input.forceUpdateEnabled },
    })

    return toAdminDto(updated)
  },

  async refreshFromStores(actor: AuthUser) {
    await this.ensureDefaults()
    const now = new Date()
    const iosResult = await fetchIosStoreVersion()
    const androidResult = await fetchAndroidStoreVersion()

    const errors: { platform: ForceUpdatePlatform; error: string }[] = []

    if (iosResult.ok) {
      await appForceUpdateRepository.update('ios', {
        latestStoreVersion: iosResult.version,
        lastFetchedAt: now,
        storeUrl: DEFAULT_STORE_URLS.ios,
      })
    } else {
      errors.push({ platform: 'ios', error: iosResult.error })
    }

    if (androidResult.ok) {
      await appForceUpdateRepository.update('android', {
        latestStoreVersion: androidResult.version,
        lastFetchedAt: now,
        storeUrl: DEFAULT_STORE_URLS.android,
      })
    } else {
      errors.push({ platform: 'android', error: androidResult.error })
    }

    await recordAuditEvent({
      actorId: actor.id,
      action: 'APP_FORCE_UPDATE_REFRESH',
      targetType: 'AppForceUpdateConfig',
      targetId: 'all',
      metadata: {
        ios: iosResult.ok ? iosResult.version : iosResult.error,
        android: androidResult.ok ? androidResult.version : androidResult.error,
      },
    })

    const items = await this.listForAdmin()
    return { items, errors }
  },
}
