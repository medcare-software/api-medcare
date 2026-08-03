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

  sumAll() {
    return db.storeDownloadSnapshot.aggregate({
      _sum: { downloadCount: true },
    })
  },

  sumAllByPlatform() {
    return db.storeDownloadSnapshot.groupBy({
      by: ['platform'],
      _sum: { downloadCount: true },
    })
  },

  sumInRange(startDate: Date, endDate: Date) {
    return db.storeDownloadSnapshot.aggregate({
      where: { date: { gte: startDate, lte: endDate } },
      _sum: { downloadCount: true },
    })
  },

  monthlySeriesByPlatform(months: number) {
    return db.$queryRaw<{ month: Date; platform: string; count: bigint }[]>`
      SELECT date_trunc('month', date) AS month, platform, sum("downloadCount")::bigint AS count
      FROM store_download_snapshots
      WHERE date >= date_trunc('month', now()) - make_interval(months => (${months}::int - 1))
      GROUP BY 1, 2
      ORDER BY 1, 2
    `
  },
}
