import type { ExamType, GmailImportedExam, GmailIntegration, LabEmail } from '@prisma/client'

import { db } from '../../config/database.js'
import { env } from '../../config/env.js'
import { assertOwnScopedMemberInScope } from '../../shared/access/index.js'
import { extractExamFromEmail } from '../../shared/ai/gmail-exam.client.js'
import { AppError } from '../../shared/errors/index.js'
import {
  extractEmailAddress,
  getAttachment,
  getMessage,
  getMessageMetadata,
  listHistoryMessageIds,
  refreshAccessToken,
  searchMessages,
  watchMailbox,
} from '../../shared/google/gmail-oauth.client.js'
import { sendPushToUser } from '../../shared/push/index.js'
import { decryptField, encryptField, recordSensitiveAccess } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { filesRepository } from '../files/files.repository.js'
import { gmailImportRepository } from './gmail-import.repository.js'

// Formato salvo em GmailImportedExam.extractedSummary — mistura a saída bruta
// da IA (ver GmailExamExtraction) com o subject do e-mail, guardado à parte
// porque a mensagem original não fica persistida em lugar nenhum além disso.
type StoredExtractedSummary = {
  isLabResult: boolean
  patientNameGuess?: string
  examType?: ExamType
  examDateGuess?: string
  resultsSummary?: string
  subject?: string
  skipReason?: string
}

function resolvePendingName(summary: StoredExtractedSummary): string {
  return summary.resultsSummary?.slice(0, 120) || summary.subject || 'Exame importado do Gmail'
}

function toPendingResponse(item: GmailImportedExam, ownerMemberId: string | null) {
  const summary = (item.extractedSummary ?? {}) as StoredExtractedSummary
  return {
    id: item.id,
    fileId: item.fileId,
    ownerMemberId,
    suggestedMemberId: item.suggestedMemberId,
    name: resolvePendingName(summary),
    examType: summary.examType ?? 'OUTROS',
    examDate: summary.examDateGuess ?? item.createdAt.toISOString(),
    createdAt: item.createdAt,
  }
}

const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const WATCH_RENEW_AHEAD_MS = 48 * 60 * 60 * 1000

function formatGmailDate(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function labEmailSet(labs: LabEmail[]): Set<string> {
  return new Set(labs.map((l) => l.email.trim().toLowerCase()))
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

async function processMessage(
  integration: GmailIntegration,
  accessToken: string,
  messageId: string,
  allowedSenders: Set<string>,
): Promise<Date | null> {
  const meta = await getMessageMetadata(accessToken, messageId)
  const fromAddress = extractEmailAddress(meta.from)
  if (!allowedSenders.has(fromAddress)) {
    return null
  }

  const message = await getMessage(accessToken, messageId)
  const internalDate = new Date(Number(message.internalDate))

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

  // Persistimos mesmo em falha/null da IA para não reprocessar a mesma
  // mensagem (e gastar token) a cada push/safety-net.
  if (!extraction) {
    await gmailImportRepository.createImportedExam({
      gmailIntegrationId: integration.id,
      gmailMessageId: messageId,
      extractedSummary: {
        isLabResult: false,
        subject: message.subject,
        skipReason: 'ai_unavailable_or_null',
      },
      status: 'IGNORED',
    })
    return internalDate
  }

  if (!extraction.isLabResult) {
    await gmailImportRepository.createImportedExam({
      gmailIntegrationId: integration.id,
      gmailMessageId: messageId,
      extractedSummary: { ...extraction, subject: message.subject },
      status: 'IGNORED',
    })
    return internalDate
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

  const familyMembers = await gmailImportRepository.findFamilyMembersByUserId(integration.userId)
  const matchedMemberId = findConfidentMemberMatch(familyMembers, extraction.patientNameGuess)

  const owner = await db.user.findUnique({
    where: { id: integration.userId },
    select: { role: true },
  })
  const ownMember =
    owner?.role === 'FAMILY_MEMBER'
      ? await gmailImportRepository.findOwnFamilyMember(integration.userId)
      : null
  // FAMILY_MEMBER só auto-linka no próprio prontuário — match de outro membro fica PENDING.
  const canAutoLink =
    matchedMemberId && (owner?.role !== 'FAMILY_MEMBER' || matchedMemberId === ownMember?.id)

  if (canAutoLink && matchedMemberId) {
    const exam = await gmailImportRepository.createExam({
      memberId: matchedMemberId,
      name:
        extraction.resultsSummary?.slice(0, 120) || message.subject || 'Exame importado do Gmail',
      examType: extraction.examType ?? 'OUTROS',
      examDate: extraction.examDateGuess ? new Date(extraction.examDateGuess) : internalDate,
      ...(fileId && { fileId }),
    })

    await gmailImportRepository.createImportedExam({
      gmailIntegrationId: integration.id,
      gmailMessageId: messageId,
      suggestedMemberId: matchedMemberId,
      ...(fileId && { fileId }),
      extractedSummary: { ...extraction, subject: message.subject },
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
    const pending = await gmailImportRepository.createImportedExam({
      gmailIntegrationId: integration.id,
      gmailMessageId: messageId,
      ...(fileId && { fileId }),
      extractedSummary: { ...extraction, subject: message.subject },
      status: 'PENDING',
    })
    await sendPushToUser(integration.userId, {
      title: 'Laudo aguardando revisão',
      body: 'Recebemos um laudo por e-mail, mas precisamos que você confirme de quem é.',
      data: { type: 'gmail-exam-needs-review', gmailImportedExamId: pending.id },
    })
  }

  return internalDate
}

async function processMessageIds(
  integration: GmailIntegration,
  accessToken: string,
  messageIds: string[],
  activeLabEmails: LabEmail[],
): Promise<Date> {
  const allowedSenders = labEmailSet(activeLabEmails)
  const alreadyImported = await gmailImportRepository.findExistingMessageIds(
    integration.id,
    messageIds,
  )
  const newMessageIds = messageIds.filter((id) => !alreadyImported.has(id))
  console.info(
    `[gmail-import] Integração ${integration.id}: ${newMessageIds.length} nova(s) de ${messageIds.length} (resto já importado/ignorado).`,
  )

  let latestProcessedAt = integration.lastVerifiedAt

  for (const messageId of newMessageIds) {
    try {
      const processedAt = await processMessage(integration, accessToken, messageId, allowedSenders)
      if (processedAt && processedAt > latestProcessedAt) latestProcessedAt = processedAt
    } catch (err) {
      console.error(
        `[gmail-import] Falha ao processar mensagem ${messageId} da integração ${integration.id}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return latestProcessedAt
}

/** Polling allow-list (safety-net / fallback quando watch não está ativo). */
async function processIntegrationBySearch(
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
    `[gmail-import] Integração ${integration.id}: ${messageIds.length} mensagem(ns) na busca (query="${query}").`,
  )
  if (messageIds.length === 0) {
    await gmailImportRepository.touchLastVerifiedAt(integration.userId, new Date())
    return
  }

  const latestProcessedAt = await processMessageIds(
    integration,
    accessToken,
    messageIds,
    activeLabEmails,
  )
  await gmailImportRepository.touchLastVerifiedAt(integration.userId, latestProcessedAt)
}

async function processIntegrationByHistory(
  integration: GmailIntegration,
  activeLabEmails: LabEmail[],
  notificationHistoryId?: string,
): Promise<void> {
  const accessToken = await ensureFreshAccessToken(integration)
  if (!accessToken) {
    console.warn(`[gmail-import] Integração ${integration.id} sem token válido — pulando push.`)
    return
  }

  const startHistoryId = integration.historyId
  if (!startHistoryId) {
    console.warn(
      `[gmail-import] Integração ${integration.id} sem historyId — caindo para busca allow-list.`,
    )
    await processIntegrationBySearch(integration, activeLabEmails)
    return
  }

  let messageIds: string[]
  let latestHistoryId: string | null
  try {
    const history = await listHistoryMessageIds(accessToken, startHistoryId)
    messageIds = history.messageIds
    latestHistoryId = history.latestHistoryId ?? notificationHistoryId ?? null
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : undefined
    // historyId expirado/inválido → resync via busca filtrada.
    if (status === 404) {
      console.warn(
        `[gmail-import] historyId inválido na integração ${integration.id} — resync via search.`,
      )
      await processIntegrationBySearch(integration, activeLabEmails)
      if (notificationHistoryId) {
        await gmailImportRepository.updateWatchCursor(integration.userId, {
          historyId: notificationHistoryId,
        })
      }
      return
    }
    throw err
  }

  console.info(
    `[gmail-import] Integração ${integration.id}: history retornou ${messageIds.length} mensagem(ns).`,
  )

  if (messageIds.length > 0) {
    const latestProcessedAt = await processMessageIds(
      integration,
      accessToken,
      messageIds,
      activeLabEmails,
    )
    await gmailImportRepository.touchLastVerifiedAt(integration.userId, latestProcessedAt)
  } else {
    await gmailImportRepository.touchLastVerifiedAt(integration.userId, new Date())
  }

  const nextHistoryId = latestHistoryId ?? notificationHistoryId
  if (nextHistoryId) {
    await gmailImportRepository.updateWatchCursor(integration.userId, {
      historyId: nextHistoryId,
    })
  }
}

export const gmailImportService = {
  /** Safety-net diário: só integrações sem watch válido (ou Pub/Sub desligado). */
  async runSafetyNet(): Promise<void> {
    const startedAt = Date.now()
    const activeLabEmails = await gmailImportRepository.findActiveLabEmails()
    if (activeLabEmails.length === 0) {
      console.info('[gmail-import] Safety-net: nenhum LabEmail ativo — nada a fazer.')
      return
    }

    const integrations = await gmailImportRepository.findIntegrationsNeedingSafetyNet()
    console.info(
      `[gmail-import] Safety-net: ${activeLabEmails.length} lab(s), ${integrations.length} integração(ões) sem watch válido.`,
    )

    for (const integration of integrations) {
      try {
        await processIntegrationBySearch(integration, activeLabEmails)
      } catch (err) {
        console.error(
          `[gmail-import] Falha na integração ${integration.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    console.info(`[gmail-import] Safety-net concluído em ${Date.now() - startedAt}ms.`)
  },

  /** Compat: run() aponta para o safety-net (não faz mais poll a cada minuto). */
  async run(): Promise<void> {
    await gmailImportService.runSafetyNet()
  },

  async handlePushNotification(payload: {
    emailAddress: string
    historyId: string
  }): Promise<void> {
    const activeLabEmails = await gmailImportRepository.findActiveLabEmails()
    if (activeLabEmails.length === 0) {
      console.info('[gmail-import] Push ignorado: nenhum LabEmail ativo.')
      return
    }

    const integration = await gmailImportRepository.findConnectedByGoogleEmail(payload.emailAddress)
    if (!integration) {
      console.info(
        `[gmail-import] Push para ${payload.emailAddress}: nenhuma integração CONNECTED+autoImport.`,
      )
      return
    }

    await processIntegrationByHistory(integration, activeLabEmails, payload.historyId)
  },

  async renewExpiringWatches(): Promise<void> {
    if (!env.GMAIL_PUBSUB_TOPIC) {
      console.info('[gmail-import] renew watches: GMAIL_PUBSUB_TOPIC não configurado — skip.')
      return
    }

    const due = await gmailImportRepository.findWatchesNeedingRenewal(
      new Date(Date.now() + WATCH_RENEW_AHEAD_MS),
    )
    console.info(`[gmail-import] Renovando watch em ${due.length} integração(ões).`)

    for (const integration of due) {
      try {
        const accessToken = await ensureFreshAccessToken(integration)
        if (!accessToken) continue
        const watch = await watchMailbox(accessToken, env.GMAIL_PUBSUB_TOPIC)
        await gmailImportRepository.updateWatchCursor(integration.userId, {
          historyId: watch.historyId,
          watchExpiration: watch.expiration,
        })
      } catch (err) {
        console.error(
          `[gmail-import] Falha ao renovar watch ${integration.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  },

  async listPending(userId: string) {
    const [items, ownerMember] = await Promise.all([
      gmailImportRepository.findPendingByUserId(userId),
      gmailImportRepository.findOwnFamilyMember(userId),
    ])
    return items.map((item) => toPendingResponse(item, ownerMember?.id ?? null))
  },

  async getById(userId: string, id: string) {
    const [item, ownerMember] = await Promise.all([
      gmailImportRepository.findByIdScoped(id, userId),
      gmailImportRepository.findOwnFamilyMember(userId),
    ])
    if (!item) throw new AppError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' })
    return toPendingResponse(item, ownerMember?.id ?? null)
  },

  // Cria o Exam de verdade só aqui, quando o usuário confirma de qual membro é
  // — nunca antes disso (ver processMessage: caminho PENDING não cria Exam).
  async confirm(user: AuthUser, id: string, memberId: string) {
    const item = await gmailImportRepository.findByIdScoped(id, user.id)
    if (!item) throw new AppError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' })
    if (item.status !== 'PENDING') {
      throw new AppError({ code: 'CONFLICT', message: 'Este laudo já foi revisado' })
    }

    await assertOwnScopedMemberInScope(user, memberId)

    const summary = (item.extractedSummary ?? {}) as StoredExtractedSummary
    const exam = await gmailImportRepository.createExam({
      memberId,
      name: resolvePendingName(summary),
      examType: summary.examType ?? 'OUTROS',
      examDate: summary.examDateGuess ? new Date(summary.examDateGuess) : item.createdAt,
      ...(item.fileId && { fileId: item.fileId }),
    })

    await gmailImportRepository.markConfirmed(item.id, exam.id)
    await gmailImportRepository.incrementImportedCount(user.id)
    await sendPushToUser(user.id, {
      title: 'Novo laudo importado do Gmail',
      body: `"${exam.name}" foi importado.`,
      data: { type: 'exam-shared', examId: exam.id, memberId },
    })

    return exam
  },

  async reject(userId: string, id: string) {
    const item = await gmailImportRepository.findByIdScoped(id, userId)
    if (!item) throw new AppError({ code: 'NOT_FOUND', message: 'Laudo não encontrado' })
    if (item.status !== 'PENDING') {
      throw new AppError({ code: 'CONFLICT', message: 'Este laudo já foi revisado' })
    }

    if (item.fileId) {
      await filesRepository.deleteObject(item.fileId)
    }
    await gmailImportRepository.markRejected(item.id)
  },
}
