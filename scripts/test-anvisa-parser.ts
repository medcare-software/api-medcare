import { readFileSync } from 'node:fs'

import { parseAnvisaPdf } from '../src/modules/anvisa-medications/anvisa-medications.parser.js'

const cases = [
  ['test/fixtures/anvisa/lista-a-incluidos-05022025.pdf', 'A', 'ADDITION'],
  ['test/fixtures/anvisa/lista-a-excluidos-05022025.pdf', 'A', 'REMOVAL'],
  ['test/fixtures/anvisa/lista-b-incluidos-06012025.pdf', 'B', 'ADDITION'],
  ['test/fixtures/anvisa/lista-b-excluidos-06012025.pdf', 'B', 'REMOVAL'],
] as const

async function main() {
  for (const [path, listType, operation] of cases) {
    const buf = readFileSync(path)
    const rows = await parseAnvisaPdf(buf, { listType, operation })
    const incomplete = rows.filter(
      (r) =>
        !r.substance || !r.holder || !r.medicationName || !r.concentration || !r.pharmaceuticalForm,
    )
    console.log(path.split('/').pop(), 'count', rows.length, 'incomplete', incomplete.length)
    console.log(
      JSON.stringify(
        rows.slice(0, 2),
        (_, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
        2,
      ),
    )
    if (incomplete[0]) console.log('incomplete', incomplete[0])
    if (operation === 'REMOVAL') {
      const withReason = rows.filter((r) => r.exclusionReason).length
      console.log('withReason', withReason)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
