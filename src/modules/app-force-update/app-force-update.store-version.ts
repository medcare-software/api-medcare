import { env } from '../../config/env.js'

const IOS_LOOKUP = 'https://itunes.apple.com/lookup'
const PLAY_DETAILS = 'https://play.google.com/store/apps/details'

export type StoreVersionFetchResult =
  | { ok: true; version: string }
  | { ok: false; error: string }

function normalizeVersion(raw: string): string | null {
  const trimmed = raw.trim()
  if (!/^\d+(\.\d+){0,3}$/.test(trimmed)) return null
  return trimmed
}

export async function fetchIosStoreVersion(): Promise<StoreVersionFetchResult> {
  const appId = env.APP_STORE_CONNECT_APP_ID
  const url = `${IOS_LOOKUP}?id=${encodeURIComponent(appId)}&country=br`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      return { ok: false, error: `App Store respondeu ${res.status}` }
    }
    const body = (await res.json()) as {
      resultCount?: number
      results?: Array<{ version?: string }>
    }
    const version = body.results?.[0]?.version
    if (!version) {
      return { ok: false, error: 'Versão iOS não encontrada no lookup da App Store' }
    }
    const normalized = normalizeVersion(version)
    if (!normalized) {
      return { ok: false, error: `Versão iOS inválida: ${version}` }
    }
    return { ok: true, version: normalized }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao consultar App Store',
    }
  }
}

function parsePlayStoreVersion(html: string): string | null {
  const patterns = [
    /"softwareVersion"\s*:\s*"([^"]+)"/i,
    /\[\[\["(\d+(?:\.\d+){1,3})"\]\]/,
    /\[\[\['(\d+(?:\.\d+){1,3})'\]\]/,
    /Current Version<\/div><span[^>]*>\s*(\d+(?:\.\d+){1,3})\s*</i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const normalized = normalizeVersion(match[1])
      if (normalized) return normalized
    }
  }
  return null
}

export async function fetchAndroidStoreVersion(): Promise<StoreVersionFetchResult> {
  const packageName = env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || 'com.condev.medcare'
  const url = `${PLAY_DETAILS}?id=${encodeURIComponent(packageName)}&hl=en&gl=US`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      return { ok: false, error: `Play Store respondeu ${res.status}` }
    }
    const html = await res.text()
    const version = parsePlayStoreVersion(html)
    if (!version) {
      return {
        ok: false,
        error: 'Versão Android não encontrada na página da Play Store',
      }
    }
    return { ok: true, version }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao consultar Play Store',
    }
  }
}
