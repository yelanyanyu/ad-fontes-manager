export const normalizeSearchInput = (value) => {
  const text = String(value ?? '')
  return text.replace(/[\s\u3000]+/g, ' ').trim()
}

export const isBlankSearch = (value) => {
  return normalizeSearchInput(value).length === 0
}

export const filterRecordsBySearch = (records, value, mode = 'partial') => {
  const normalized = normalizeSearchInput(value)
  if (isBlankSearch(normalized)) return records
  const needle = normalized.toLowerCase()
  if (mode === 'exact') {
    return records.filter(r => String(r.lemma || r.yield?.lemma || '').toLowerCase() === needle)
  }
  return records.filter(r => String(r.lemma || r.yield?.lemma || '').toLowerCase().includes(needle))
}
