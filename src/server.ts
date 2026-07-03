import 'dotenv/config'

// Env deve ser validado antes de qualquer outra coisa
import './config/env.js'

import { buildApp } from './app.js'
import { env } from './config/env.js'

const start = async () => {
  try {
    const app = await buildApp()
    await app.listen({ port: env.PORT, host: env.SERVER_HOST })
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

start()
