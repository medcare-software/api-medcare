import 'dotenv/config'

// Env deve ser validado antes de qualquer outra coisa
import './config/env.js'

import cron from 'node-cron'

import { buildApp } from './app.js'
import { env } from './config/env.js'
import { checkExpiringAccessJob } from './shared/jobs/expiring-access.job.js'
import { gmailImportJob, gmailRenewWatchesJob } from './shared/jobs/gmail-import.job.js'
import { storeAnalyticsSyncJob } from './shared/jobs/store-analytics-sync.job.js'

const start = async () => {
  try {
    const app = await buildApp()
    await app.listen({ port: env.PORT, host: env.SERVER_HOST })

    // Uma vez por dia, às 8h — avisa acessos concedidos perto de expirar (ver
    // src/shared/jobs/expiring-access.job.ts). Roda só no processo do servidor
    // real (não em buildApp/testes) para não disparar push durante testes.
    cron.schedule('0 8 * * *', () => {
      void checkExpiringAccessJob().catch((err) => {
        app.log.error(err, '[cron] falha ao checar acessos expirando')
      })
    })

    // Uma vez por dia, às 9h — sincroniza downloads do dia anterior via App
    // Store Connect/Google Play (ver src/shared/jobs/store-analytics-sync.job.ts).
    // No-op silencioso por plataforma quando as credenciais não estão configuradas.
    cron.schedule('0 9 * * *', () => {
      void storeAnalyticsSyncJob().catch((err) => {
        app.log.error(err, '[cron] falha ao sincronizar downloads das lojas')
      })
    })

    // Se a tabela de snapshots estiver vazia e houver credenciais, faz um
    // backfill curto em background no boot — evita home/relatório zerados até
    // alguém lembrar de rodar o script manualmente.
    void (async () => {
      const { storeAnalyticsService } = await import(
        './modules/store-analytics/store-analytics.service.js'
      )
      const configured = storeAnalyticsService.isConfigured()
      if (!configured.ios && !configured.android) return
      const totals = await storeAnalyticsService.getAllTimeTotals()
      if (totals.total > 0) return
      app.log.info(
        '[store-analytics] snapshots vazios — iniciando backfill automático (30 dias)',
      )
      await storeAnalyticsService.syncDownloads({ daysBack: 30, throttleMs: 400 })
      const after = await storeAnalyticsService.getAllTimeTotals()
      app.log.info(
        { total: after.total, byPlatform: after.byPlatform },
        '[store-analytics] backfill automático concluído',
      )
    })().catch((err) => {
      app.log.error(err, '[store-analytics] falha no backfill automático do boot')
    })

    // Gmail: caminho principal = Pub/Sub (POST /webhooks/gmail-push).
    // Safety-net 1×/dia (03:00) só para integrações sem watch válido.
    cron.schedule('0 3 * * *', () => {
      void gmailImportJob().catch((err) => {
        app.log.error(err, '[cron] falha no safety-net de importação Gmail')
      })
    })

    // Renova users.watch (~7 dias de validade) todas as manhãs às 4h.
    cron.schedule('0 4 * * *', () => {
      void gmailRenewWatchesJob().catch((err) => {
        app.log.error(err, '[cron] falha ao renovar watches do Gmail')
      })
    })
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

start()
