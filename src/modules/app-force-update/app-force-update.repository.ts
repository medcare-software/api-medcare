import { db } from '../../config/database.js'

export type ForceUpdatePlatform = 'ios' | 'android'

export const appForceUpdateRepository = {
  findAll() {
    return db.appForceUpdateConfig.findMany({
      orderBy: { platform: 'asc' },
    })
  },

  findByPlatform(platform: ForceUpdatePlatform) {
    return db.appForceUpdateConfig.findUnique({ where: { platform } })
  },

  create(data: {
    platform: ForceUpdatePlatform
    storeUrl: string
    latestStoreVersion?: string
    forceUpdateEnabled?: boolean
  }) {
    return db.appForceUpdateConfig.create({
      data: {
        platform: data.platform,
        storeUrl: data.storeUrl,
        latestStoreVersion: data.latestStoreVersion ?? '',
        forceUpdateEnabled: data.forceUpdateEnabled ?? false,
      },
    })
  },

  update(
    platform: ForceUpdatePlatform,
    data: {
      forceUpdateEnabled?: boolean
      latestStoreVersion?: string
      lastFetchedAt?: Date | null
      storeUrl?: string
    },
  ) {
    return db.appForceUpdateConfig.update({
      where: { platform },
      data,
    })
  },
}
