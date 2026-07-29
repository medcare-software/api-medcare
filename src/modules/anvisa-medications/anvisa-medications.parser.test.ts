import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseAnvisaPdf } from './anvisa-medications.parser.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../test/fixtures/anvisa')

describe('parseAnvisaPdf', () => {
  it('parses lista A incluídos', async () => {
    const buffer = readFileSync(join(fixturesDir, 'lista-a-incluidos-05022025.pdf'))
    const rows = await parseAnvisaPdf(buffer, { listType: 'A', operation: 'ADDITION' })
    expect(rows.length).toBeGreaterThan(1500)
    expect(rows[0]).toMatchObject({
      substance: 'abacavir (sulfato)',
      medicationName: 'ZIAGENAVIR',
      registrationNumber: '101070234',
    })
    expect(rows[0]?.includedAt).toBeInstanceOf(Date)
  }, 60_000)

  it('parses lista A excluídos with reason', async () => {
    const buffer = readFileSync(join(fixturesDir, 'lista-a-excluidos-05022025.pdf'))
    const rows = await parseAnvisaPdf(buffer, { listType: 'A', operation: 'REMOVAL' })
    expect(rows.length).toBeGreaterThan(800)
    expect(rows[0]?.exclusionReason).toBeTruthy()
    expect(rows[0]?.excludedAt).toBeInstanceOf(Date)
  }, 60_000)

  it('parses lista B incluídos with association wrap', async () => {
    const buffer = readFileSync(join(fixturesDir, 'lista-b-incluidos-06012025.pdf'))
    const rows = await parseAnvisaPdf(buffer, { listType: 'B', operation: 'ADDITION' })
    expect(rows.length).toBeGreaterThan(300)
    const first = rows.find((r) => r.registrationNumber === '178170775')
    expect(first?.substance).toContain('betametasona')
    expect(first?.concentration).toContain('+')
  }, 60_000)
})
