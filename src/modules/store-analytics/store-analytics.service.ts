import { promisify } from 'node:util'
import zlib from 'node:zlib'

import { GoogleAuth } from 'google-auth-library'
import jwt from 'jsonwebtoken'

import { env } from '../../config/env.js'
import { storeAnalyticsRepository } from './store-analytics.repository.js'
import type { StoreDownloadsQuery } from './store-analytics.schema.js'

const gunzip = promisify(zlib.gunzip)

// Tipos de produto que representam download do app em si (não in-app purchase/
// assinatura) no relatório "Sales and Trends" da Apple — ver
// https://developer.apple.com/documentation/appstoreconnectapi/generate_download_reports_for_sales_and_trends
// "1"/"1E"/"1F" = app grátis/pago (novo download), "7"/"7F" = update.
// NÃO VERIFICADO CONTRA A API REAL — confirmar assim que houver credenciais.
const APP_STORE_DOWNLOAD_PRODUCT_TYPES = new Set(['1', '1E', '1F'])

function isAppStoreConnectConfigured(): boolean {
  return Boolean(
    env.APP_STORE_CONNECT_KEY_ID &&
      env.APP_STORE_CONNECT_ISSUER_ID &&
      env.APP_STORE_CONNECT_PRIVATE_KEY &&
      env.APP_STORE_CONNECT_VENDOR_NUMBER,
  )
}

function isGooglePlayConfigured(): boolean {
  return Boolean(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && env.GOOGLE_PLAY_PACKAGE_NAME)
}

// JWT de curta duração (máx. 20 min) exigido pela App Store Connect API,
// assinado com a chave privada EC (.p8) gerada no App Store Connect.
function buildAppStoreConnectToken(): string {
  const now = Math.floor(Date.now() / 1000)
  const privateKey = (env.APP_STORE_CONNECT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  return jwt.sign(
    {
      iss: env.APP_STORE_CONNECT_ISSUER_ID,
      iat: now,
      exp: now + 20 * 60,
      aud: 'appstoreconnect-v1',
    },
    privateKey,
    {
      algorithm: 'ES256',
      keyid: env.APP_STORE_CONNECT_KEY_ID,
      header: { alg: 'ES256', kid: env.APP_STORE_CONNECT_KEY_ID, typ: 'JWT' },
    },
  )
}

// Busca o relatório diário de vendas/downloads da Apple para uma data — retorna
// `null` quando a integração não está configurada (nunca lança nesse caso) e
// lança erro real só em falha de rede/autenticação inesperada.
//
// NÃO TESTADO CONTRA A API REAL (sem credenciais no ambiente de dev) — o
// parsing do TSV segue a documentação oficial da Apple, mas os nomes exatos de
// coluna/Product Type Identifier merecem confirmação assim que houver acesso
// a uma conta real. Ver "Generate Download Reports for Sales and Trends".
async function fetchAppStoreDownloads(date: Date): Promise<number | null> {
  if (!isAppStoreConnectConfigured()) {
    console.warn('[store-analytics] App Store Connect não configurado — pulando iOS')
    return null
  }

  const reportDate = date.toISOString().slice(0, 10)
  const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports')
  url.searchParams.set('filter[frequency]', 'DAILY')
  url.searchParams.set('filter[reportDate]', reportDate)
  url.searchParams.set('filter[reportSubType]', 'SUMMARY')
  url.searchParams.set('filter[reportType]', 'SALES')
  url.searchParams.set('filter[vendorNumber]', env.APP_STORE_CONNECT_VENDOR_NUMBER ?? '')
  url.searchParams.set('filter[version]', '1_0')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${buildAppStoreConnectToken()}`,
      Accept: 'application/a-gzip',
    },
  })

  // Relatório do dia ainda não publicado pela Apple (comum para D-1 muito recente).
  if (response.status === 404) return 0
  if (!response.ok) {
    throw new Error(`App Store Connect respondeu ${response.status} ao buscar relatório de vendas`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const tsv = (await gunzip(buffer)).toString('utf-8')
  const [headerLine, ...lines] = tsv.split('\n').filter(Boolean)
  if (!headerLine) return 0

  const headers = headerLine.split('\t')
  const unitsIndex = headers.indexOf('Units')
  const productTypeIndex = headers.indexOf('Product Type Identifier')
  const appleIdIndex = headers.indexOf('Apple Identifier')
  if (unitsIndex === -1) {
    console.warn(
      '[store-analytics] Formato inesperado do relatório da Apple — coluna Units não encontrada',
    )
    return null
  }

  let totalUnits = 0
  for (const line of lines) {
    const cols = line.split('\t')
    if (appleIdIndex !== -1 && cols[appleIdIndex] !== env.APP_STORE_CONNECT_APP_ID) continue
    if (
      productTypeIndex !== -1 &&
      !APP_STORE_DOWNLOAD_PRODUCT_TYPES.has(cols[productTypeIndex] ?? '')
    ) {
      continue
    }
    totalUnits += Number(cols[unitsIndex] ?? 0) || 0
  }
  return totalUnits
}

// Busca downloads do Google Play via Play Developer Reporting API para uma
// data — mesmas ressalvas do fetchAppStoreDownloads: `null` quando não
// configurado, nunca lança nesse caso.
//
// NÃO TESTADO CONTRA A API REAL — a Play Developer Reporting API
// (playdeveloperreporting.googleapis.com) é relativamente nova; a métrica
// exata usada aqui ("installers"/dimensão "DAILY") deve ser confirmada contra
// https://developers.google.com/play/developer/reporting assim que houver uma
// service account real habilitada no Play Console.
async function fetchGooglePlayDownloads(date: Date): Promise<number | null> {
  if (!isGooglePlayConfigured()) {
    console.warn('[store-analytics] Google Play não configurado — pulando Android')
    return null
  }

  const auth = new GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? '{}'),
    scopes: ['https://www.googleapis.com/auth/playdeveloperreporting'],
  })
  const client = await auth.getClient()
  const accessTokenResponse = await client.getAccessToken()
  const accessToken = accessTokenResponse.token
  if (!accessToken) {
    console.warn('[store-analytics] Falha ao obter access token do Google Play — pulando Android')
    return null
  }

  const packageName = env.GOOGLE_PLAY_PACKAGE_NAME
  const dateFields = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
  const url = `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${packageName}/appDownloadReport:query`

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timelineSpec: { aggregationPeriod: 'DAILY', startTime: dateFields, endTime: dateFields },
      metrics: ['installers'],
    }),
  })

  if (!response.ok) {
    throw new Error(`Play Developer Reporting API respondeu ${response.status} ao buscar downloads`)
  }

  const body = (await response.json()) as {
    rows?: {
      metrics?: {
        metric: string
        value?: { doubleValue?: number; decimalValue?: { value?: string } }
      }[]
    }[]
  }
  const row = body.rows?.[0]
  const metric = row?.metrics?.find((item) => item.metric === 'installers')
  if (!metric) {
    console.warn(
      '[store-analytics] Formato inesperado da resposta do Google Play — métrica não encontrada',
    )
    return null
  }
  const value = metric.value?.doubleValue ?? Number(metric.value?.decimalValue?.value ?? 0)
  return Math.round(value)
}

function utcDay(date: Date): Date {
  const day = new Date(date)
  day.setUTCHours(0, 0, 0, 0)
  return day
}

async function syncDay(date: Date): Promise<void> {
  const day = utcDay(date)

  const results = await Promise.allSettled([
    fetchAppStoreDownloads(day),
    fetchGooglePlayDownloads(day),
  ])

  const [iosResult, androidResult] = results
  if (iosResult.status === 'fulfilled' && iosResult.value !== null) {
    await storeAnalyticsRepository.upsertSnapshot({
      platform: 'ios',
      date: day,
      downloadCount: iosResult.value,
      source: 'app_store_connect',
    })
  } else if (iosResult.status === 'rejected') {
    console.error('[store-analytics] Falha ao sincronizar downloads iOS', iosResult.reason)
  }

  if (androidResult.status === 'fulfilled' && androidResult.value !== null) {
    await storeAnalyticsRepository.upsertSnapshot({
      platform: 'android',
      date: day,
      downloadCount: androidResult.value,
      source: 'google_play',
    })
  } else if (androidResult.status === 'rejected') {
    console.error(
      '[store-analytics] Falha ao sincronizar downloads Android',
      androidResult.reason,
    )
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const storeAnalyticsService = {
  // Sincroniza downloads das lojas. Por padrão (`daysBack: 1`) só o dia
  // anterior — relatórios normalmente só ficam prontos em D+1. Use `daysBack`
  // maior para backfill histórico. Cada plataforma falha isoladamente.
  async syncDownloads(options: { daysBack?: number; throttleMs?: number } = {}): Promise<void> {
    const daysBack = Math.max(1, options.daysBack ?? 1)
    const throttleMs = options.throttleMs ?? 0

    for (let offset = daysBack; offset >= 1; offset -= 1) {
      const day = new Date()
      day.setUTCDate(day.getUTCDate() - offset)
      await syncDay(day)
      if (throttleMs > 0 && offset > 1) await sleep(throttleMs)
    }
  },

  async getAggregatedDownloads(query: StoreDownloadsQuery) {
    const endDate = new Date()
    endDate.setUTCHours(23, 59, 59, 999)
    const startDate = new Date(endDate)
    startDate.setUTCDate(startDate.getUTCDate() - query.days)
    startDate.setUTCHours(0, 0, 0, 0)

    const [snapshots, byPlatform] = await Promise.all([
      storeAnalyticsRepository.findInRange(startDate, endDate),
      storeAnalyticsRepository.sumByPlatform(startDate, endDate),
    ])

    return {
      configured: { ios: isAppStoreConnectConfigured(), android: isGooglePlayConfigured() },
      totalsByPlatform: byPlatform.map((row) => ({
        platform: row.platform,
        totalDownloads: row._sum.downloadCount ?? 0,
      })),
      series: snapshots.map((snapshot) => ({
        date: snapshot.date.toISOString().slice(0, 10),
        platform: snapshot.platform,
        downloadCount: snapshot.downloadCount,
      })),
    }
  },

  isConfigured() {
    return { ios: isAppStoreConnectConfigured(), android: isGooglePlayConfigured() }
  },

  async getAllTimeTotals() {
    const [allTime, byPlatform] = await Promise.all([
      storeAnalyticsRepository.sumAll(),
      storeAnalyticsRepository.sumAllByPlatform(),
    ])
    return {
      total: allTime._sum.downloadCount ?? 0,
      byPlatform: byPlatform.map((row) => ({
        platform: row.platform,
        totalDownloads: row._sum.downloadCount ?? 0,
      })),
    }
  },

  async getDownloadsInRange(startDate: Date, endDate: Date) {
    const agg = await storeAnalyticsRepository.sumInRange(startDate, endDate)
    return agg._sum.downloadCount ?? 0
  },

  async getMonthlyDownloadsByPlatform(months: number) {
    const rows = await storeAnalyticsRepository.monthlySeriesByPlatform(months)
    const byMonth = new Map<string, { month: string; ios: number; android: number; total: number }>()

    for (const row of rows) {
      const month = row.month.toISOString().slice(0, 7)
      const entry = byMonth.get(month) ?? { month, ios: 0, android: 0, total: 0 }
      const count = Number(row.count)
      if (row.platform === 'ios') entry.ios += count
      else if (row.platform === 'android') entry.android += count
      entry.total = entry.ios + entry.android
      byMonth.set(month, entry)
    }

    // Preenche meses sem snapshot para o chart não “pular” buracos.
    const result: { month: string; ios: number; android: number; total: number }[] = []
    const cursor = new Date()
    cursor.setUTCDate(1)
    cursor.setUTCHours(0, 0, 0, 0)
    cursor.setUTCMonth(cursor.getUTCMonth() - (months - 1))

    for (let i = 0; i < months; i += 1) {
      const month = cursor.toISOString().slice(0, 7)
      result.push(byMonth.get(month) ?? { month, ios: 0, android: 0, total: 0 })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }

    return result
  },
}
