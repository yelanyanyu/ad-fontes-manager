import type { WordRecord } from '@/types/word-list';

export const makeWordSelectionKey = (item: Pick<WordRecord, 'id' | 'isLocal'>): string => {
  return `${item.isLocal ? 'local' : 'db'}:${String(item.id)}`;
};

export const getSelectedLemmas = (
  records: Array<Pick<WordRecord, 'id' | 'isLocal' | 'lemma' | 'yield'>>,
  selectedKeys: Set<string>
): string[] => {
  return records
    .filter(item => selectedKeys.has(makeWordSelectionKey(item)))
    .map(item => item.lemma || item.yield?.lemma || '')
    .filter((lemma): lemma is string => Boolean(lemma.trim()));
};
