/**
 * Backfill da carência de 30 dias no primeiro ciclo de cobrança (ver fix em
 * `payments.service.ts#ensurePaymentsGenerated`): antes da correção, um
 * Payment do primeiro ciclo de uma assinatura já nascia OVERDUE no mesmo dia
 * da criação. Este script reclassifica pra PENDING os registros que foram
 * gerados errado antes dos 30 dias de carência e que ainda não foram pagos.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/backfill-overdue-payments-grace-period.ts
 *   DATABASE_URL=... npx tsx scripts/backfill-overdue-payments-grace-period.ts --dry-run
 */
import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

const isDryRun = process.argv.includes('--dry-run')
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000
const db = new PrismaClient()

async function main() {
  const now = new Date()

  const candidates = await db.payment.findMany({
    where: { status: 'OVERDUE' },
    include: { subscription: { select: { id: true, createdAt: true } } },
  })

  const toFix = candidates.filter((payment) => {
    const { subscription, referenceMonth } = payment
    const isFirstCycle =
      referenceMonth.getFullYear() === subscription.createdAt.getFullYear() &&
      referenceMonth.getMonth() === subscription.createdAt.getMonth()
    if (!isFirstCycle) return false
    return now.getTime() - subscription.createdAt.getTime() < GRACE_PERIOD_MS
  })

  console.log(
    `Encontrados ${candidates.length} pagamentos OVERDUE, ${toFix.length} dentro da carência de 30 dias.`,
  )

  for (const payment of toFix) {
    console.log(
      `${isDryRun ? '[dry-run] ' : ''}Payment ${payment.id} (subscription ${payment.subscriptionId}, vínculo em ${payment.subscription.createdAt.toISOString()}) → PENDING`,
    )
  }

  if (isDryRun || toFix.length === 0) {
    console.log(isDryRun ? 'Dry-run: nenhuma alteração persistida.' : 'Nada para corrigir.')
    return
  }

  const result = await db.payment.updateMany({
    where: { id: { in: toFix.map((payment) => payment.id) } },
    data: { status: 'PENDING' },
  })

  console.log(`Reclassificados ${result.count} pagamentos de OVERDUE para PENDING.`)
}

main()
  .catch((err) => {
    console.error('Falha no backfill:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
