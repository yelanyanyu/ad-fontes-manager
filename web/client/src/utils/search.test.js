import { describe, it, expect } from 'vitest'
import { normalizeSearchInput, isBlankSearch } from './search'

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
