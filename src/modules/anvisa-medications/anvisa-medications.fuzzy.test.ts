import { describe, expect, it } from 'vitest'

import {
  levenshtein,
  normalizeSearchText,
  scoreCatalogItem,
  scoreMedicationName,
} from './anvisa-medications.fuzzy.js'

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

  it('matches fármaco even when the brand name is different', () => {
    const item = {
      medicationName: 'CONCOR',
      substance: 'bisoprolol (hemifumarato de)',
    }
    expect(scoreCatalogItem('hemifumarato', item)).toBe(1)
    expect(scoreMedicationName('hemifumarato', item.medicationName)).toBe(Number.POSITIVE_INFINITY)
  })
})
