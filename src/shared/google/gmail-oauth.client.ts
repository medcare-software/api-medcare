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

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const { clientId, clientSecret } = assertConfigured()

  let response: Response
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch (err) {
    console.error(
      `[gmail-oauth] Falha de rede ao renovar access token: ${err instanceof Error ? err.message : String(err)}`,
    )
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível renovar a conexão com o Gmail.',
    })
  }

  if (!response.ok) {
    const body = await response.text()
    console.error(`[gmail-oauth] Refresh de token falhou (${response.status}): ${body}`)
    throw new AppError({
      code: 'GMAIL_OAUTH_EXCHANGE_FAILED',
      message: 'Não foi possível renovar a conexão com o Gmail.',
    })
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in }
}

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

async function gmailFetch(accessToken: string, path: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${GMAIL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    console.error(
      `[gmail-oauth] Falha de rede ao chamar a Gmail API (${path}): ${err instanceof Error ? err.message : String(err)}`,
    )
    throw new AppError({
      code: 'GMAIL_API_ERROR',
      message: 'Não foi possível acessar o Gmail agora.',
    })
  }

  if (!response.ok) {
    const body = await response.text()
    console.error(`[gmail-oauth] Gmail API falhou (${response.status}) em ${path}: ${body}`)
    throw new AppError({
      code: 'GMAIL_API_ERROR',
      message: 'Não foi possível acessar o Gmail agora.',
    })
  }

  return response.json()
}

// Busca só ids de mensagens — cada resultado é lido individualmente depois via
// getMessage(). `query` já vem pronta com o allow-list de remetentes (ver
// gmail-import.service.ts), nunca uma busca livre na caixa toda.
export async function searchMessages(
  accessToken: string,
  query: string,
  maxPages = 5,
): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  let page = 0

  do {
    const params = new URLSearchParams({ q: query, maxResults: '50' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = (await gmailFetch(accessToken, `/messages?${params.toString()}`)) as {
      messages?: { id: string }[]
      nextPageToken?: string
    }
    ids.push(...(data.messages ?? []).map((m) => m.id))
    pageToken = data.nextPageToken
    page += 1
  } while (pageToken && page < maxPages)

  return ids
}

type GmailMessagePart = {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailMessagePart[]
}

export type GmailMessage = {
  id: string
  internalDate: string
  from: string
  subject: string
  bodyText: string
  attachment: { filename: string; mimeType: string; attachmentId: string } | null
}

function findHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8')
}

const ATTACHMENT_FILENAME_PATTERN = /\.(pdf|png|jpe?g)$/i

// Percorre a árvore de partes MIME procurando o primeiro texto simples (corpo)
// e o primeiro anexo com extensão relevante (laudo em PDF/imagem) — ignora o
// resto (ex.: parte HTML duplicada, assinatura, tracking pixel).
function extractBodyAndAttachment(part: GmailMessagePart): {
  bodyText: string
  attachment: GmailMessage['attachment']
} {
  let bodyText = ''
  let attachment: GmailMessage['attachment'] = null

  function walk(p: GmailMessagePart) {
    if (p.filename && p.body?.attachmentId) {
      if (!attachment && ATTACHMENT_FILENAME_PATTERN.test(p.filename)) {
        attachment = {
          filename: p.filename,
          mimeType: p.mimeType ?? 'application/octet-stream',
          attachmentId: p.body.attachmentId,
        }
      }
      return
    }
    if (p.mimeType === 'text/plain' && p.body?.data && !bodyText) {
      bodyText = decodeBase64Url(p.body.data)
      return
    }
    for (const child of p.parts ?? []) walk(child)
  }

  walk(part)
  return { bodyText, attachment }
}

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  const data = (await gmailFetch(accessToken, `/messages/${messageId}?format=full`)) as {
    id: string
    internalDate: string
    payload: GmailMessagePart & { headers: { name: string; value: string }[] }
  }
  const headers = data.payload.headers ?? []
  const { bodyText, attachment } = extractBodyAndAttachment(data.payload)

  return {
    id: data.id,
    internalDate: data.internalDate,
    from: findHeader(headers, 'From'),
    subject: findHeader(headers, 'Subject'),
    bodyText,
    attachment,
  }
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const data = (await gmailFetch(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  )) as { data: string }
  return Buffer.from(data.data, 'base64url')
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
