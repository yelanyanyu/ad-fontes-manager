import { describe, expect, it } from 'vitest';
import {
  createBatchProgress,
  getImportableBatchItems,
  stepBatchProgress,
  summarizeBatchStatuses,
  updateBatchItemsResolution,
} from './batchAnkiService';
import type { BatchAnkiExportItem } from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

const createItem = (
  key: string,
  status: BatchAnkiExportItem['status'],
  overrides: Partial<BatchAnkiExportItem> = {}
): BatchAnkiExportItem => ({
  key,
  id: key,
  lemma: key,
  record: { id: key } as WordRecord,
  payload: null,
  conflict: null,
  resolution: 'undecided',
  status,
  error: '',
  noteId: null,
  ...overrides,
});

describe('updateBatchItemsResolution', () => {
  it('updates only duplicate items', () => {
    const input = [
      createItem('a', 'duplicate', { conflict: { noteId: 1 } as any }),
      createItem('b', 'ready'),
    ];

    const output = updateBatchItemsResolution(input, 'overwrite');
    expect(output[0].resolution).toBe('overwrite');
    expect(output[1].resolution).toBe('undecided');
  });
});

describe('getImportableBatchItems', () => {
  it('keeps ready items and resolved duplicates', () => {
    const items = [
      createItem('a', 'ready'),
      createItem('b', 'duplicate', { conflict: { noteId: 1 } as any, resolution: 'skip' }),
      createItem('c', 'duplicate', { conflict: { noteId: 2 } as any, resolution: 'undecided' }),
      createItem('d', 'failed'),
    ];
    expect(getImportableBatchItems(items).map(item => item.key)).toEqual(['a', 'b']);
  });
});

describe('progress helpers', () => {
  it('tracks progress step-by-step', () => {
    const p0 = createBatchProgress('check', 3);
    const p1 = stepBatchProgress(p0);
    const p2 = stepBatchProgress(p1);
    expect(p0.percent).toBe(0);
    expect(p1.processed).toBe(1);
    expect(p2.percent).toBe(67);
  });
});

describe('summarizeBatchStatuses', () => {
  it('counts status totals', () => {
    const items = [createItem('a', 'imported'), createItem('b', 'failed'), createItem('c', 'failed')];
    const summary = summarizeBatchStatuses(items);
    expect(summary.imported).toBe(1);
    expect(summary.failed).toBe(2);
  });
});
