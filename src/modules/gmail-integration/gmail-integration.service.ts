import type { FastifyInstance } from 'fastify'

import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors/index.js'
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
  revokeToken,
} from '../../shared/google/gmail-oauth.client.js'
import { decryptField, encryptField, maskEmail } from '../../shared/security/index.js'
import type { AuthUser, GmailOAuthStatePayload } from '../../shared/types/auth.types.js'
import { gmailImportRepository } from '../gmail-import/gmail-import.repository.js'
import { gmailIntegrationRepository } from './gmail-integration.repository.js'
import type { UpdateGmailSettingsInput } from './gmail-integration.schema.js'

// state de curta duração — só precisa sobreviver ao tempo do usuário completar
// o consentimento no navegador do Google.
const OAUTH_STATE_EXPIRES_IN = '10m'

export const gmailIntegrationService = {
  startConnect(fastify: FastifyInstance, user: AuthUser): { authUrl: string } {
    const payload: Omit<GmailOAuthStatePayload, 'iat' | 'exp'> = {
      sub: user.id,
      purpose: 'gmail_oauth_state',
    }
    const state = fastify.jwt.sign(payload, { expiresIn: OAUTH_STATE_EXPIRES_IN })
    return { authUrl: buildAuthUrl(state) }
  },

  // Sempre resolve numa URL de redirect (nunca lança pro chamador) — quem chama
  // é o navegador do celular, então falha aqui vira `?status=error` no deep
  // link, não um JSON de erro que ninguém veria.
  async handleOAuthCallback(
    fastify: FastifyInstance,
    query: { code?: string; state?: string; error?: string },
  ): Promise<{ redirectUrl: string }> {
    const fail = () => ({ redirectUrl: `${env.GOOGLE_OAUTH_APP_RETURN_SCHEME}?status=error` })

    if (query.error || !query.code || !query.state) {
      return fail()
    }

    let statePayload: GmailOAuthStatePayload
    try {
      statePayload = fastify.jwt.verify<GmailOAuthStatePayload>(query.state)
    } catch {
      return fail()
    }
    if (statePayload.purpose !== 'gmail_oauth_state') {
      return fail()
    }

    try {
      const tokens = await exchangeCodeForTokens(query.code)
      const { email } = await getUserInfo(tokens.accessToken)

      await gmailIntegrationRepository.upsertFromOAuth({
        userId: statePayload.sub,
        googleEmail: email,
        accessTokenEncrypted: encryptField(tokens.accessToken),
        refreshTokenEncrypted: encryptField(tokens.refreshToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
        scope: tokens.scope,
      })

      return { redirectUrl: `${env.GOOGLE_OAUTH_APP_RETURN_SCHEME}?status=success` }
    } catch (err) {
      console.error(
        `[gmail-integration] Callback falhou pro usuário ${statePayload.sub}: ${err instanceof Error ? err.message : String(err)}`,
      )
      return fail()
    }
  },

  async getStatus(user: AuthUser) {
    const integration = await gmailIntegrationRepository.findByUserId(user.id)
    if (!integration || integration.status !== 'CONNECTED') {
      return { connected: false as const }
    }
    const pendingReviewCount = await gmailImportRepository.countPendingByUserId(user.id)
    return {
      connected: true as const,
      googleEmailMasked: maskEmail(integration.googleEmail, 4),
      connectedAt: integration.connectedAt,
      lastVerifiedAt: integration.lastVerifiedAt,
      importedCount: integration.importedCount,
      autoImportEnabled: integration.autoImportEnabled,
      pendingReviewCount,
    }
  },

  async updateSettings(user: AuthUser, input: UpdateGmailSettingsInput) {
    const integration = await gmailIntegrationRepository.findByUserId(user.id)
    if (!integration || integration.status !== 'CONNECTED') {
      throw new AppError({ code: 'GMAIL_NOT_CONNECTED', message: 'Gmail não está conectado' })
    }
    await gmailIntegrationRepository.updateSettings(user.id, input)
  },

  async disconnect(user: AuthUser): Promise<void> {
    const integration = await gmailIntegrationRepository.findByUserId(user.id)
    if (!integration || integration.status !== 'CONNECTED') {
      throw new AppError({ code: 'GMAIL_NOT_CONNECTED', message: 'Gmail não está conectado' })
    }
    if (integration.refreshTokenEncrypted) {
      await revokeToken(decryptField(integration.refreshTokenEncrypted))
    }
    await gmailIntegrationRepository.markDisconnected(user.id)
  },
}
