export const normalizeSearchInput = (value) => {
  const text = String(value ?? '')
  return text.replace(/[\s\u3000]+/g, ' ').trim()
}

export const isBlankSearch = (value) => {
  return normalizeSearchInput(value).length === 0
}
