import { makeWordSelectionKey } from '@/utils/wordSelection';
import type { WordRecord } from '@/types/word-list';

export interface SelectAllMatchingPageResult {
  items: WordRecord[];
  page: number;
  totalPages: number;
}

export interface SelectAllMatchingDecision {
  total: number;
  requiresConfirm: boolean;
}

export const buildSelectAllMatchingDecision = (
  dbTotal: number,
  localMatchedCount: number,
  threshold = 150
): SelectAllMatchingDecision => {
  const total = Math.max(0, dbTotal) + Math.max(0, localMatchedCount);
  return {
    total,
    requiresConfirm: total > threshold,
  };
};

export const collectAllDbMatchingRecords = async (
  fetchPage: (page: number, limit: number) => Promise<SelectAllMatchingPageResult>,
  limit = 200
): Promise<WordRecord[]> => {
  const first = await fetchPage(1, limit);
  const records = [...first.items];

  for (let page = 2; page <= Math.max(1, first.totalPages); page += 1) {
    const current = await fetchPage(page, limit);
    records.push(...current.items);
  }

  return records;
};

export const mergeRecordsIntoSelectionMap = (
  existing: Map<string, WordRecord>,
  incoming: WordRecord[]
): Map<string, WordRecord> => {
  const next = new Map(existing);
  incoming.forEach(record => {
    next.set(makeWordSelectionKey(record), { ...record });
  });
  return next;
};
