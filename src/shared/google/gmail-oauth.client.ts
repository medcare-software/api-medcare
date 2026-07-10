import { env } from '../../config/env.js'
import { AppError } from '../errors/index.js'

// Fase 1 (só connect/disconnect) — sem SDK do Google, só fetch puro contra os
// endpoints públicos do OAuth2/Gmail, mesmo estilo enxuto do cliente Anthropic
// (src/shared/ai/anthropic-vision.client.ts).

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

// gmail.readonly é escopo restrito do Google — suficiente pra Fase 1 (só a
// conta é lida via userinfo.email) e já cobre a futura pipeline de importação
// de laudos, sem precisar de um segundo consentimento depois.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ')

function assertConfigured(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Integração com Gmail não configurada.',
    })
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
}

export function buildAuthUrl(state: string): string {
  const { clientId } = assertConfigured()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export type GoogleTokens = {
  accessToken: string
  refreshToken: string
  expiresInSeconds: number
  scope: string
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = assertConfigured()

  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      }),
    })
  } catch (err) {
    console.error(
      `[gmail-oauth] Falha de rede ao trocar code por tokens: ${err instanceof Error ? err.message : String(err)}`,
    )
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível conectar ao Gmail.',
    })
  }

  if (!response.ok) {
    const body = await response.text()
    console.error(`[gmail-oauth] Token exchange falhou (${response.status}): ${body}`)
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível conectar ao Gmail.',
    })
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }

  if (!data.refresh_token) {
    // Acontece quando o usuário já tinha autorizado antes sem revogar — Google só
    // manda refresh_token na primeira autorização (ou com prompt=consent forçado,
    // que já mandamos acima). Tratado como falha porque sem refresh_token não dá
    // pra manter a conexão viva além da expiração do access_token.
    console.error(
      '[gmail-oauth] Resposta sem refresh_token — revogar acesso na conta Google e tentar de novo.',
    )
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível conectar ao Gmail.',
    })
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
    scope: data.scope,
  }
}

export async function getUserInfo(accessToken: string): Promise<{ email: string }> {
  let response: Response
  try {
    response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    console.error(
      `[gmail-oauth] Falha de rede ao buscar userinfo: ${err instanceof Error ? err.message : String(err)}`,
    )
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível conectar ao Gmail.',
    })
  }

  if (!response.ok) {
    const body = await response.text()
    console.error(`[gmail-oauth] userinfo falhou (${response.status}): ${body}`)
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível conectar ao Gmail.',
    })
  }

  const data = (await response.json()) as { email?: string }
  if (!data.email) {
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível conectar ao Gmail.',
    })
  }
  return { email: data.email }
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?${new URLSearchParams({ token }).toString()}`, { method: 'POST' })
  } catch (err) {
    // Não bloqueia a desconexão local por uma falha de rede ao revogar no Google
    // — o token já é removido do nosso banco de qualquer forma.
    console.error(
      `[gmail-oauth] Falha ao revogar token no Google (ignorada): ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
