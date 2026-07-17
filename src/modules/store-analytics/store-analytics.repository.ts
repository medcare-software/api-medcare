import { db } from '../../config/database.js'

type SnapshotData = {
  platform: 'ios' | 'android'
  date: Date
  downloadCount: number
  source: 'app_store_connect' | 'google_play'
}

export const storeAnalyticsRepository = {
  upsertSnapshot(data: SnapshotData) {
    return db.storeDownloadSnapshot.upsert({
      where: {
        platform_date_source: { platform: data.platform, date: data.date, source: data.source },
      },
      create: data,
      update: { downloadCount: data.downloadCount },
    })
  },

  findInRange(startDate: Date, endDate: Date) {
    return db.storeDownloadSnapshot.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    })
  },

  sumByPlatform(startDate: Date, endDate: Date) {
    return db.storeDownloadSnapshot.groupBy({
      by: ['platform'],
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { downloadCount: true },
    })
  },
}
