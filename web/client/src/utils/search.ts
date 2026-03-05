export type SearchMode = 'partial' | 'exact';

type SearchableRecord = {
  lemma?: unknown;
  yield?: {
    lemma?: unknown;
  };
};

export const normalizeSearchInput = (value: unknown): string => {
  const text = String(value ?? '');
  return text.replace(/[\s\u3000]+/g, ' ').trim();
};

export const isBlankSearch = (value: unknown): boolean => {
  return normalizeSearchInput(value).length === 0;
};

const extractLemma = (record: SearchableRecord): string => {
  return String(record.lemma ?? record.yield?.lemma ?? '');
};

export const filterRecordsBySearch = <T extends SearchableRecord>(
  records: T[],
  value: unknown,
  mode: SearchMode = 'partial'
): T[] => {
  const normalized = normalizeSearchInput(value);
  if (isBlankSearch(normalized)) return records;

  const needle = normalized.toLowerCase();

  if (mode === 'exact') {
    return records.filter(record => extractLemma(record).toLowerCase() === needle);
  }

  return records.filter(record => extractLemma(record).toLowerCase().includes(needle));
};
