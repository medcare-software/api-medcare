import 'dotenv/config'

// Env deve ser validado antes de qualquer outra coisa
import './config/env.js'

import cron from 'node-cron'

import { buildApp } from './app.js'
import { env } from './config/env.js'
import { checkExpiringAccessJob } from './shared/jobs/expiring-access.job.js'

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
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

start()
