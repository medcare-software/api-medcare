/**
 * Backfill de downloads das lojas (App Store Connect + Google Play) para
 * popular `store_download_snapshots` com histórico imediato. O cron diário
 * só sincroniza D-1 — este script cobre os N dias anteriores.
 *
 * Uso:
 *   npx tsx scripts/backfill-store-downloads.ts
 *   npx tsx scripts/backfill-store-downloads.ts --days=90
 *   npx tsx scripts/backfill-store-downloads.ts --days=90 --throttle-ms=500
 */
import 'dotenv/config'

import { storeAnalyticsService } from '../src/modules/store-analytics/store-analytics.service.js'

function readArg(name: string, fallback: number): number {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

async function main() {
  const days = readArg('days', 90)
  const throttleMs = readArg('throttle-ms', 400)
  const configured = storeAnalyticsService.isConfigured()

  console.log(
    `[backfill-store-downloads] Iniciando backfill de ${days} dias (throttle ${throttleMs}ms). ` +
      `iOS=${configured.ios ? 'ok' : 'não configurado'}, Android=${configured.android ? 'ok' : 'não configurado'}`,
  )

  if (!configured.ios && !configured.android) {
    console.warn(
      '[backfill-store-downloads] Nenhuma integração configurada. ' +
        'Preencha as variáveis APP_STORE_CONNECT_* / GOOGLE_PLAY_* no .env.',
    )
    process.exitCode = 1
    return
  }

  await storeAnalyticsService.syncDownloads({ daysBack: days, throttleMs })
  console.log('[backfill-store-downloads] Concluído.')
}

main().catch((err) => {
  console.error('[backfill-store-downloads] Falha:', err)
  process.exitCode = 1
})
