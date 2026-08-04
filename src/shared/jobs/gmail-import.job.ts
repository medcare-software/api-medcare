import { gmailImportService } from '../../modules/gmail-import/gmail-import.service.js'

/** Safety-net diário — só integrações sem users.watch válido. O caminho
 * principal é o webhook Pub/Sub (gmail-push.routes.ts). */
export async function gmailImportJob(): Promise<void> {
  await gmailImportService.runSafetyNet()
}

/** Renova users.watch antes da expiration (~7 dias). */
export async function gmailRenewWatchesJob(): Promise<void> {
  await gmailImportService.renewExpiringWatches()
}
