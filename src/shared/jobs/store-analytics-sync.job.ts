import { storeAnalyticsService } from '../../modules/store-analytics/store-analytics.service.js'

/** Roda uma vez por dia (ver server.ts) — sincroniza os downloads do dia
 * anterior via App Store Connect e Google Play. Ver store-analytics.service.ts
 * para o comportamento quando as credenciais não estão configuradas.
 * Para histórico inicial (prod): `npm run script:backfill-store-downloads -- --days=90`. */
export async function storeAnalyticsSyncJob(): Promise<void> {
  await storeAnalyticsService.syncDownloads({ daysBack: 1 })
}
