import type { GmailIntegration, LabEmail } from '@prisma/client'

import { extractExamFromEmail } from '../../shared/ai/gmail-exam.client.js'
import {
  getAttachment,
  getMessage,
  refreshAccessToken,
  searchMessages,
} from '../../shared/google/gmail-oauth.client.js'
import { sendPushToUser } from '../../shared/push/index.js'
import { decryptField, encryptField, recordSensitiveAccess } from '../../shared/security/index.js'
import { filesRepository } from '../files/files.repository.js'
import { gmailImportRepository } from './gmail-import.repository.js'

const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

function formatGmailDate(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Só considera "confiante" quando exatamente 1 membro da família bate com o
// nome extraído pela IA — ambiguidade vira PENDING (revisão manual), nunca um
// palpite que possa anexar o exame ao membro errado.
function findConfidentMemberMatch(
  members: { id: string; displayName: string }[],
  guess: string | undefined,
): string | undefined {
  if (!guess) return undefined
  const normalizedGuess = normalizeName(guess)
  const matches = members.filter((m) => {
    const normalizedName = normalizeName(m.displayName)
    return (
      normalizedName === normalizedGuess ||
      normalizedName.includes(normalizedGuess) ||
      normalizedGuess.includes(normalizedName)
    )
  })
  return matches.length === 1 ? matches[0]?.id : undefined
}

async function ensureFreshAccessToken(integration: GmailIntegration): Promise<string | null> {
  if (!integration.accessTokenEncrypted || !integration.refreshTokenEncrypted) return null

  const expiresAt = integration.tokenExpiresAt
  if (expiresAt && expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return decryptField(integration.accessTokenEncrypted)
  }

  try {
    const refreshToken = decryptField(integration.refreshTokenEncrypted)
    const refreshed = await refreshAccessToken(refreshToken)
    await gmailImportRepository.updateTokens(integration.userId, {
      accessTokenEncrypted: encryptField(refreshed.accessToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
    })
    return refreshed.accessToken
  } catch (err) {
    console.error(
      `[gmail-import] Falha ao renovar token da integração ${integration.id}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}

async function processIntegration(
  integration: GmailIntegration,
  activeLabEmails: LabEmail[],
): Promise<void> {
  const accessToken = await ensureFreshAccessToken(integration)
  if (!accessToken) {
    console.warn(
      `[gmail-import] Integração ${integration.id} sem token válido (desconectada ou refresh falhou) — pulando.`,
    )
    return
  }

  const senderClause = activeLabEmails.map((lab) => lab.email).join(' OR ')
  const query = `from:(${senderClause}) after:${formatGmailDate(integration.lastVerifiedAt)}`

  const messageIds = await searchMessages(accessToken, query)
  console.info(
    `[gmail-import] Integração ${integration.id}: ${messageIds.length} mensagem(ns) encontrada(s) na busca (query="${query}").`,
  )
  if (messageIds.length === 0) {
    await gmailImportRepository.touchLastVerifiedAt(integration.userId, new Date())
    return
  }

  const alreadyImported = await gmailImportRepository.findExistingMessageIds(
    integration.id,
    messageIds,
  )
  const newMessageIds = messageIds.filter((id) => !alreadyImported.has(id))
  console.info(
    `[gmail-import] Integração ${integration.id}: ${newMessageIds.length} nova(s) de ${messageIds.length} (resto já importado/ignorado antes).`,
  )

  let latestProcessedAt = integration.lastVerifiedAt

  for (const messageId of newMessageIds) {
    try {
      const message = await getMessage(accessToken, messageId)
      const internalDate = new Date(Number(message.internalDate))
      // Dedupe já é garantido por GmailImportedExam.gmailMessageId (@@unique)
      // — não filtrar por data aqui de novo, senão uma mensagem anterior ao
      // connectedAt (ou do mesmo dia da conexão) fica presa num loop de
      // "descoberta → pulada" pra sempre, sem nunca virar um registro.
      if (internalDate > latestProcessedAt) latestProcessedAt = internalDate

      // Toda leitura de mensagem de terceiro fica auditada — é o mecanismo que
      // prova que só lemos o que dissemos que leríamos (allow-list de LabEmail),
      // nunca uma varredura silenciosa da caixa toda.
      await recordSensitiveAccess({
        actorId: integration.userId,
        action: 'AI_READ_LAB_EMAIL',
        targetType: 'GmailMessage',
        targetId: message.id,
        metadata: { from: message.from, subject: message.subject },
      })

      let attachmentBase64: string | undefined
      if (message.attachment) {
        try {
          const bytes = await getAttachment(accessToken, messageId, message.attachment.attachmentId)
          if (bytes.length <= MAX_ATTACHMENT_BYTES) {
            attachmentBase64 = bytes.toString('base64')
          }
        } catch (err) {
          console.error(
            `[gmail-import] Falha ao baixar anexo da mensagem ${messageId}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      const extraction = await extractExamFromEmail({
        subject: message.subject,
        from: message.from,
        bodyText: message.bodyText,
        ...(attachmentBase64 &&
          message.attachment && {
            attachment: { mimeType: message.attachment.mimeType, base64: attachmentBase64 },
          }),
      })

      // IA indisponível agora — não cria registro nenhum, a mensagem continua
      // "nova" e será reprocessada na próxima rodada do cron (fail-open, sem
      // perder a mensagem).
      if (!extraction) continue

      if (!extraction.isLabResult) {
        await gmailImportRepository.createImportedExam({
          gmailIntegrationId: integration.id,
          gmailMessageId: messageId,
          extractedSummary: { ...extraction },
          status: 'IGNORED',
        })
        continue
      }

      let fileId: string | undefined
      if (attachmentBase64 && message.attachment) {
        fileId = filesRepository.generateObjectKey()
        await filesRepository.putObject(
          fileId,
          Buffer.from(attachmentBase64, 'base64'),
          message.attachment.mimeType,
          { 'x-amz-meta-source': 'gmail-import' },
        )
      }

      const familyMembers = await gmailImportRepository.findFamilyMembersByUserId(
        integration.userId,
      )
      const matchedMemberId = findConfidentMemberMatch(familyMembers, extraction.patientNameGuess)

      if (matchedMemberId) {
        const exam = await gmailImportRepository.createExam({
          memberId: matchedMemberId,
          name:
            extraction.resultsSummary?.slice(0, 120) ||
            message.subject ||
            'Exame importado do Gmail',
          examType: extraction.examType ?? 'OUTROS',
          examDate: extraction.examDateGuess ? new Date(extraction.examDateGuess) : internalDate,
          ...(fileId && { fileId }),
        })

        await gmailImportRepository.createImportedExam({
          gmailIntegrationId: integration.id,
          gmailMessageId: messageId,
          suggestedMemberId: matchedMemberId,
          ...(fileId && { fileId }),
          extractedSummary: { ...extraction },
          status: 'AUTO_LINKED',
          resolvedExamId: exam.id,
        })
        await gmailImportRepository.incrementImportedCount(integration.userId)
        await sendPushToUser(integration.userId, {
          title: 'Novo laudo importado do Gmail',
          body: `"${exam.name}" foi importado automaticamente.`,
          data: { type: 'exam-shared', examId: exam.id, memberId: matchedMemberId },
        })
      } else {
        await gmailImportRepository.createImportedExam({
          gmailIntegrationId: integration.id,
          gmailMessageId: messageId,
          ...(fileId && { fileId }),
          extractedSummary: { ...extraction },
          status: 'PENDING',
        })
        await sendPushToUser(integration.userId, {
          title: 'Laudo aguardando revisão',
          body: 'Recebemos um laudo por e-mail, mas precisamos que você confirme de quem é.',
          data: { type: 'gmail-exam-needs-review' },
        })
      }
    } catch (err) {
      console.error(
        `[gmail-import] Falha ao processar mensagem ${messageId} da integração ${integration.id}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  await gmailImportRepository.touchLastVerifiedAt(integration.userId, latestProcessedAt)
}

export const gmailImportService = {
  async run(): Promise<void> {
    const startedAt = Date.now()
    const activeLabEmails = await gmailImportRepository.findActiveLabEmails()
    if (activeLabEmails.length === 0) {
      console.info('[gmail-import] Rodada do cron: nenhum LabEmail ativo cadastrado — nada a fazer.')
      return
    }

    const integrations = await gmailImportRepository.findConnectedIntegrations()
    console.info(
      `[gmail-import] Rodada do cron: ${activeLabEmails.length} laboratório(s) ativo(s), ${integrations.length} conta(s) Gmail conectada(s) com auto-import.`,
    )

    for (const integration of integrations) {
      try {
        await processIntegration(integration, activeLabEmails)
      } catch (err) {
        console.error(
          `[gmail-import] Falha na integração ${integration.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    console.info(`[gmail-import] Rodada do cron concluída em ${Date.now() - startedAt}ms.`)
  },
}
