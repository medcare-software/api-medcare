import { describe, expect, it } from 'vitest'

import { levenshtein, normalizeSearchText, scoreMedicationName } from './anvisa-medications.fuzzy.js'

describe('anvisa-medications.fuzzy', () => {
  it('normalizes accents and case', () => {
    expect(normalizeSearchText('Clorídrico')).toBe('cloridrico')
  })

  it('scores exact and typo close to Dorflex', () => {
    expect(scoreMedicationName('Dorflex', 'Dorflex')).toBe(0)
    expect(scoreMedicationName('Dorfrex', 'Dorflex')).toBeLessThan(20)
    expect(scoreMedicationName('Do', 'Dorflex')).toBe(0.5)
    expect(scoreMedicationName('zzzz', 'Dorflex')).toBe(Number.POSITIVE_INFINITY)
  })

  it('levenshtein distance for one substitution', () => {
    expect(levenshtein('dorfrex', 'dorflex')).toBe(1)
  })
})
