import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export type AnvisaListType = 'A' | 'B'
export type AnvisaImportOperation = 'ADDITION' | 'REMOVAL'

export type ParsedAnvisaRow = {
  substance: string
  holder: string
  medicationName: string
  registrationNumber: string
  concentration: string
  pharmaceuticalForm: string
  includedAt: Date | null
  excludedAt: Date | null
  exclusionReason: string | null
}

type TextItem = {
  str: string
  x: number
  y: number
  page: number
}

type Line = {
  page: number
  y: number
  items: TextItem[]
}

type ColumnKey =
  | 'substance'
  | 'holder'
  | 'medicationName'
  | 'registrationNumber'
  | 'concentration'
  | 'pharmaceuticalForm'
  | 'date'
  | 'reason'

type ColumnBounds = Record<ColumnKey, { min: number; max: number }>

const REGISTRATION_RE = /^\d{7,}$/
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const TITLE_RE = /LISTA\s+[ABC]|MEDICAMENTOS|REFERENCIA|REFERÊNCIA/i

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function joinParts(...parts: Array<string | null | undefined>) {
  return normalizeSpace(parts.filter(Boolean).join(' '))
}

function parseBrDate(value: string): Date | null {
  const match = value.match(DATE_RE)
  if (!match) return null
  const [, dd, mm, yyyy] = match
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  return Number.isNaN(date.getTime()) ? null : date
}

function isHeaderNoise(text: string) {
  const upper = normalizeSpace(text).toUpperCase()
  if (TITLE_RE.test(upper)) return true
  const exactLabels = new Set([
    'FÁRMACO',
    'ASSOCIAÇÃO',
    'DETENTOR',
    'MEDICAMENTO',
    'REGISTRO',
    'CONCENTRAÇÃO',
    'FORMA',
    'FORMA FARMACÊUTICA',
    'FARMACÊUTICA',
    'DATA',
    'DATA DE',
    'DATA DE INCLUSÃO',
    'DATA INCLUSÃO',
    'INCLUSÃO',
    'EXCLUSÃO',
    'MOTIVO',
    'MOTIVO DA EXCLUSÃO',
    'DE',
    'DA',
  ])
  return exactLabels.has(upper)
}

function isSubstanceContinuation(text: string) {
  const normalized = normalizeSpace(text)
  if (!normalized) return false
  // Nova associação tipicamente traz "+" — não mesclar como continuação da linha anterior
  if (normalized.includes('+')) return false
  return normalized.length <= 48
}

async function extractTextItems(buffer: Buffer): Promise<TextItem[]> {
  const data = new Uint8Array(buffer)
  const doc = await getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise

  const items: TextItem[] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    for (const raw of content.items) {
      if (!('str' in raw) || typeof raw.str !== 'string') continue
      const str = raw.str.trim()
      if (!str) continue
      const transform = raw.transform
      items.push({
        str,
        x: transform[4],
        y: transform[5],
        page: pageNum,
      })
    }
  }
  return items
}

function groupLines(items: TextItem[]): Line[] {
  const buckets = new Map<string, TextItem[]>()
  for (const item of items) {
    const yKey = Math.round(item.y)
    const key = `${item.page}:${yKey}`
    const list = buckets.get(key) ?? []
    list.push(item)
    buckets.set(key, list)
  }

  return [...buckets.entries()]
    .map(([key, lineItems]) => {
      const [pageStr, yStr] = key.split(':')
      return {
        page: Number(pageStr),
        y: Number(yStr),
        items: lineItems.sort((a, b) => a.x - b.x),
      }
    })
    .sort((a, b) => (a.page === b.page ? b.y - a.y : a.page - b.page))
}

function detectBounds(lines: Line[], operation: AnvisaImportOperation): ColumnBounds {
  const headerLine = lines.find((line) => {
    const text = line.items.map((i) => i.str.toUpperCase()).join(' ')
    return text.includes('REGISTRO') && text.includes('CONCENTRAÇÃO')
  })
  if (!headerLine) {
    throw new Error('Cabeçalho da tabela ANVISA não encontrado no PDF')
  }

  const findLabelX = (labels: string[]) => {
    for (const line of lines.slice(0, 30)) {
      if (line.page !== headerLine.page) continue
      if (Math.abs(line.y - headerLine.y) > 25) continue
      for (const item of line.items) {
        const upper = item.str.toUpperCase()
        if (labels.some((label) => upper.includes(label))) return item.x
      }
    }
    return null
  }

  const substanceX = findLabelX(['FÁRMACO', 'ASSOCIAÇÃO']) ?? headerLine.items[0]?.x ?? 50
  const holderX = findLabelX(['DETENTOR']) ?? substanceX + 100
  const medicationX = findLabelX(['MEDICAMENTO']) ?? holderX + 90
  const registrationX = findLabelX(['REGISTRO']) ?? medicationX + 90
  const concentrationX = findLabelX(['CONCENTRAÇÃO']) ?? registrationX + 70
  const formX = findLabelX(['FORMA']) ?? concentrationX + 80
  const dateX =
    findLabelX(
      operation === 'REMOVAL' ? ['DATA DE', 'EXCLUSÃO'] : ['DATA DE INCLUSÃO', 'DATA', 'INCLUSÃO'],
    ) ?? formX + 70
  const reasonX =
    operation === 'REMOVAL' ? (findLabelX(['MOTIVO']) ?? dateX + 70) : Number.POSITIVE_INFINITY

  const starts = [
    { key: 'substance' as const, x: substanceX },
    { key: 'holder' as const, x: holderX },
    { key: 'medicationName' as const, x: medicationX },
    { key: 'registrationNumber' as const, x: registrationX },
    { key: 'concentration' as const, x: concentrationX },
    { key: 'pharmaceuticalForm' as const, x: formX },
    { key: 'date' as const, x: dateX },
    ...(operation === 'REMOVAL' ? [{ key: 'reason' as const, x: reasonX }] : []),
  ].sort((a, b) => a.x - b.x)

  const bounds = {
    substance: { min: 0, max: 0 },
    holder: { min: 0, max: 0 },
    medicationName: { min: 0, max: 0 },
    registrationNumber: { min: 0, max: 0 },
    concentration: { min: 0, max: 0 },
    pharmaceuticalForm: { min: 0, max: 0 },
    date: { min: 0, max: 0 },
    reason: { min: 0, max: 0 },
  } satisfies ColumnBounds

  for (let i = 0; i < starts.length; i += 1) {
    const current = starts[i]!
    const next = starts[i + 1]
    const max = next ? (current.x + next.x) / 2 : Number.POSITIVE_INFINITY
    const min = i === 0 ? 0 : (starts[i - 1]!.x + current.x) / 2
    bounds[current.key] = { min, max }
  }

  if (operation === 'ADDITION') {
    bounds.reason = { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY }
  }

  return bounds
}

function columnForX(x: number, bounds: ColumnBounds): ColumnKey | null {
  for (const key of Object.keys(bounds) as ColumnKey[]) {
    const range = bounds[key]
    if (x >= range.min && x < range.max) return key
  }
  return null
}

function collectLineFields(line: Line, bounds: ColumnBounds) {
  const fields: Partial<Record<ColumnKey, string[]>> = {}
  for (const item of line.items) {
    if (isHeaderNoise(item.str)) continue
    const column = columnForX(item.x, bounds)
    if (!column) continue
    const list = fields[column] ?? []
    list.push(item.str)
    fields[column] = list
  }
  const joined: Partial<Record<ColumnKey, string>> = {}
  for (const [key, parts] of Object.entries(fields)) {
    joined[key as ColumnKey] = normalizeSpace(parts!.join(' '))
  }
  return joined
}

function lineHasRegistration(fields: Partial<Record<ColumnKey, string>>) {
  return Boolean(fields.registrationNumber && REGISTRATION_RE.test(fields.registrationNumber))
}

function isSkippableLine(line: Line) {
  const text = normalizeSpace(line.items.map((i) => i.str).join(' '))
  return !text || TITLE_RE.test(text) || isHeaderNoise(text)
}

export async function parseAnvisaPdf(
  buffer: Buffer,
  options: { listType: AnvisaListType; operation: AnvisaImportOperation },
): Promise<ParsedAnvisaRow[]> {
  const items = await extractTextItems(buffer)
  const lines = groupLines(items)
  const bounds = detectBounds(lines, options.operation)

  const rows: ParsedAnvisaRow[] = []
  let pending: Partial<Record<ColumnKey, string>> = {}

  const flushPendingInto = (target: Partial<Record<ColumnKey, string>>) => {
    for (const key of Object.keys(pending) as ColumnKey[]) {
      target[key] = joinParts(pending[key], target[key])
    }
    pending = {}
  }

  const pushRow = (fields: Partial<Record<ColumnKey, string>>) => {
    flushPendingInto(fields)
    const registrationNumber = fields.registrationNumber?.trim()
    if (!registrationNumber || !REGISTRATION_RE.test(registrationNumber)) return

    const dateValue = fields.date ? parseBrDate(fields.date) : null
    const row: ParsedAnvisaRow = {
      substance: fields.substance ?? '',
      holder: fields.holder ?? '',
      medicationName: fields.medicationName ?? '',
      registrationNumber,
      concentration: fields.concentration ?? '',
      pharmaceuticalForm: fields.pharmaceuticalForm ?? '',
      includedAt: options.operation === 'ADDITION' ? dateValue : null,
      excludedAt: options.operation === 'REMOVAL' ? dateValue : null,
      exclusionReason: options.operation === 'REMOVAL' ? (fields.reason ?? null) : null,
    }

    if (
      !row.substance ||
      !row.holder ||
      !row.medicationName ||
      !row.concentration ||
      !row.pharmaceuticalForm
    ) {
      // Mantém linha mesmo com campos parciais se tiver registro — wraps posteriores podem completar
      // via merge na sync; aqui exigimos o mínimo viável.
      if (!row.concentration || !row.pharmaceuticalForm) return
    }

    rows.push(row)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (isSkippableLine(line)) continue

    const fields = collectLineFields(line, bounds)
    if (Object.keys(fields).length === 0) continue

    if (lineHasRegistration(fields)) {
      // Holder/substance podem ter começado nas linhas anteriores
      pushRow(fields)

      // Continuação logo abaixo (substance/holder/reason wrap)
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j]!
        if (next.page !== line.page) break
        if (line.y - next.y > 28) break
        if (isSkippableLine(next)) {
          j += 1
          continue
        }
        const nextFields = collectLineFields(next, bounds)
        if (lineHasRegistration(nextFields)) break
        if (Object.keys(nextFields).length === 0) {
          j += 1
          continue
        }

        const last = rows[rows.length - 1]
        if (!last) break

        // Holder wrap fica nas linhas ACIMA (pending); abaixo só reason + continuação curta de substance
        if (nextFields.reason) {
          last.exclusionReason = joinParts(last.exclusionReason, nextFields.reason)
          i = j
          j += 1
          continue
        }
        if (
          nextFields.substance &&
          isSubstanceContinuation(nextFields.substance) &&
          !nextFields.holder &&
          !nextFields.medicationName &&
          !nextFields.concentration
        ) {
          last.substance = joinParts(last.substance, nextFields.substance)
          i = j
          j += 1
          continue
        }
        break
      }
      continue
    }

    // Fragmento antes do registro — guarda para a próxima linha completa
    for (const key of Object.keys(fields) as ColumnKey[]) {
      pending[key] = joinParts(pending[key], fields[key])
    }
  }

  // Dedup por chave natural mantendo a última ocorrência
  const byKey = new Map<string, ParsedAnvisaRow>()
  for (const row of rows) {
    const key = [
      options.listType,
      row.registrationNumber,
      row.concentration,
      row.pharmaceuticalForm,
    ].join('|')
    byKey.set(key, row)
  }

  return [...byKey.values()]
}

export function naturalKey(
  row: Pick<ParsedAnvisaRow, 'registrationNumber' | 'concentration' | 'pharmaceuticalForm'>,
  listType: AnvisaListType,
) {
  return `${listType}|${row.registrationNumber}|${row.concentration}|${row.pharmaceuticalForm}`
}
