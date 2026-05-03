import type { WordRecord } from '@/types/word-list';

export const makeWordSelectionKey = (item: Pick<WordRecord, 'id' | 'isLocal'>): string => {
  return `${item.isLocal ? 'local' : 'db'}:${String(item.id)}`;
};

export const isWordSelected = (
  selectedKeys: Set<string>,
  item: Pick<WordRecord, 'id' | 'isLocal'>
): boolean => {
  return selectedKeys.has(makeWordSelectionKey(item));
};

export const addVisibleSelections = (
  selectedKeys: Set<string>,
  items: Array<Pick<WordRecord, 'id' | 'isLocal'>>
): Set<string> => {
  const next = new Set(selectedKeys);
  items.forEach(item => {
    next.add(makeWordSelectionKey(item));
  });
  return next;
};

export const removeVisibleSelections = (
  selectedKeys: Set<string>,
  items: Array<Pick<WordRecord, 'id' | 'isLocal'>>
): Set<string> => {
  const next = new Set(selectedKeys);
  items.forEach(item => {
    next.delete(makeWordSelectionKey(item));
  });
  return next;
};

export const getSelectedLemmas = (
  records: Array<Pick<WordRecord, 'lemma' | 'yield'>>
): string[] => {
  return records
    .map(item => item.lemma || item.yield?.lemma || '')
    .filter((lemma): lemma is string => Boolean(lemma.trim()));
};
