import type { FastifyInstance } from 'fastify'
import { OAuth2Client } from 'google-auth-library'

import { env } from '../../config/env.js'
import { gmailImportService } from '../gmail-import/gmail-import.service.js'

const oauthClient = new OAuth2Client()

type PubSubPushBody = {
  message?: {
    data?: string
    messageId?: string
    publishTime?: string
  }
  subscription?: string
}

async function assertPushAuthorized(
  authorizationHeader: string | undefined,
  queryToken: string | undefined,
): Promise<boolean> {
  if (env.GMAIL_PUSH_SECRET && queryToken && queryToken === env.GMAIL_PUSH_SECRET) {
    return true
  }

  if (env.GMAIL_PUSH_AUDIENCE && authorizationHeader?.startsWith('Bearer ')) {
    const token = authorizationHeader.slice('Bearer '.length)
    try {
      await oauthClient.verifyIdToken({
        idToken: token,
        audience: env.GMAIL_PUSH_AUDIENCE,
      })
      return true
    } catch (err) {
      console.error(
        `[gmail-push] JWT OIDC inválido: ${err instanceof Error ? err.message : String(err)}`,
      )
      return false
    }
  }

  // Sem nenhum mecanismo configurado — rejeita em produção; em dev permite
  // só se nenhum secret/audience foi definido (facilita teste local do body).
  if (!env.GMAIL_PUSH_SECRET && !env.GMAIL_PUSH_AUDIENCE && env.NODE_ENV !== 'production') {
    return true
  }

  return false
}

export default async function gmailPushRoutes(fastify: FastifyInstance) {
  // POST /webhooks/gmail-push — Pub/Sub entrega notificações do users.watch
  fastify.post('/webhooks/gmail-push', async (req, reply) => {
    const query = req.query as { token?: string }
    const authorized = await assertPushAuthorized(req.headers.authorization, query.token)
    if (!authorized) {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Push não autorizado' })
    }

    const body = req.body as PubSubPushBody
    const encoded = body.message?.data
    if (!encoded) {
      // Ack vazio — Pub/Sub às vezes manda confirmation sem data
      return reply.status(204).send()
    }

    let emailAddress: string
    let historyId: string
    try {
      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')) as {
        emailAddress?: string
        historyId?: number | string
      }
      if (!decoded.emailAddress || decoded.historyId == null) {
        return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Payload inválido' })
      }
      emailAddress = decoded.emailAddress
      historyId = String(decoded.historyId)
    } catch (err) {
      console.error(
        `[gmail-push] Payload inválido: ${err instanceof Error ? err.message : String(err)}`,
      )
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Payload inválido' })
    }

    // Responde 204 rápido e processa em background — Pub/Sub reenvia se
    // demorarmos demais no request.
    setImmediate(() => {
      void gmailImportService.handlePushNotification({ emailAddress, historyId }).catch((err) => {
        console.error(
          `[gmail-push] Falha ao processar ${emailAddress}: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    })

    return reply.status(204).send()
  })
}
