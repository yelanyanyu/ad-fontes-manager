import { describe, it, expect } from 'vitest'
import { normalizeSearchInput, isBlankSearch, filterRecordsBySearch } from './search'

describe('normalizeSearchInput', () => {
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeSearchInput('   ')).toBe('')
    expect(normalizeSearchInput('\t\n')).toBe('')
  })

  it('handles fullwidth spaces as blank', () => {
    expect(normalizeSearchInput('\u3000\u3000')).toBe('')
  })

  it('trims and normalizes visible content', () => {
    expect(normalizeSearchInput('  foo  ')).toBe('foo')
    expect(normalizeSearchInput('foo\tbar')).toBe('foo bar')
  })
})

describe('isBlankSearch', () => {
  it('detects blank input variants', () => {
    expect(isBlankSearch('')).toBe(true)
    expect(isBlankSearch('   ')).toBe(true)
    expect(isBlankSearch('\t')).toBe(true)
    expect(isBlankSearch('\n')).toBe(true)
    expect(isBlankSearch('\u3000')).toBe(true)
  })

  it('detects non-blank input', () => {
    expect(isBlankSearch('a')).toBe(false)
    expect(isBlankSearch(' a ')).toBe(false)
    expect(isBlankSearch('\u3000a\u3000')).toBe(false)
  })
})

describe('filterRecordsBySearch', () => {
  const records = [
    { id: 1, lemma: 'Alpha' },
    { id: 2, lemma: 'alphabet' },
    { id: 3, lemma: 'Beta' }
  ]

  it('returns all records for blank input', () => {
    expect(filterRecordsBySearch(records, '   ')).toEqual(records)
  })

  it('filters using partial match by default', () => {
    const result = filterRecordsBySearch(records, 'alp')
    expect(result.map(r => r.id)).toEqual([1, 2])
  })

  it('filters using exact match when mode is exact', () => {
    const result = filterRecordsBySearch(records, 'alpha', 'exact')
    expect(result.map(r => r.id)).toEqual([1])
  })
})
