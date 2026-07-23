import { gmailImportService } from '../../modules/gmail-import/gmail-import.service.js'

/** Roda periodicamente (ver server.ts) — busca, para cada Gmail conectado com
 * autoImportEnabled, mensagens de remetentes cadastrados em LabEmail (status
 * ACTIVE) e importa laudos via IA. Nunca varre a caixa toda — a busca já sai
 * filtrada pelo allow-list de laboratórios. */
export async function gmailImportJob(): Promise<void> {
  await gmailImportService.run()
}
