import { describe, expect, it, vi } from 'vitest';
import {
  buildSelectAllMatchingDecision,
  collectAllDbMatchingRecords,
  mergeRecordsIntoSelectionMap,
} from '@/services/selectAllMatchingService';
import type { WordRecord } from '@/types/word-list';

const makeRecord = (id: string, isLocal = false): WordRecord =>
  ({
    id,
    isLocal,
    lemma: id,
    raw_yaml: '',
  }) as WordRecord;

describe('selectAllMatchingService', () => {
  it('flags confirmation when total exceeds threshold', () => {
    expect(buildSelectAllMatchingDecision(140, 20, 150)).toEqual({
      total: 160,
      requiresConfirm: true,
    });
    expect(buildSelectAllMatchingDecision(120, 20, 150)).toEqual({
      total: 140,
      requiresConfirm: false,
    });
  });

  it('collects db records from all pages', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      const pages: Record<number, WordRecord[]> = {
        1: [makeRecord('db-1'), makeRecord('db-2')],
        2: [makeRecord('db-3')],
      };
      return {
        items: pages[page] || [],
        page,
        totalPages: 2,
      };
    });

    const result = await collectAllDbMatchingRecords(fetchPage, 200);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.map(item => item.id)).toEqual(['db-1', 'db-2', 'db-3']);
  });

  it('merges local and db records by scoped key', () => {
    const initial = new Map<string, WordRecord>([['db:1', makeRecord('1', false)]]);
    const merged = mergeRecordsIntoSelectionMap(initial, [
      makeRecord('1', true),
      makeRecord('2', false),
    ]);

    expect(merged.has('db:1')).toBe(true);
    expect(merged.has('local:1')).toBe(true);
    expect(merged.has('db:2')).toBe(true);
  });
});
