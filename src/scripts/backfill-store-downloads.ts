/**
 * Backfill de downloads das lojas (App Store Connect + Google Play).
 *
 * Local:
 *   npx tsx src/scripts/backfill-store-downloads.ts --days=90
 * Produção (imagem Docker / Railway):
 *   npm run script:backfill-store-downloads -- --days=90
 */
import 'dotenv/config'

import { storeAnalyticsService } from '../modules/store-analytics/store-analytics.service.js'

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
        'Preencha as variáveis APP_STORE_CONNECT_* / GOOGLE_PLAY_* no ambiente.',
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
