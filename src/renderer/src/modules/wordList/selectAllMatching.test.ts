import { describe, expect, it, vi } from 'vitest';
import { selectAllMatchingWords } from '@/modules/wordList/selectAllMatching';
import type { WordRecord } from '@/types/word-list';

const makeRecord = (id: string): WordRecord =>
  ({
    id,
    lemma: id,
  }) as WordRecord;

describe('selectAllMatchingWords', () => {
  it('reports an empty result without fetching pages', async () => {
    const fetchPage = vi.fn();
    const addToast = vi.fn();

    const result = await selectAllMatchingWords({
      getDbTotal: () => 0,
      getExistingSelection: () => new Map(),
      fetchPage,
      requestConfirm: vi.fn(),
      replaceSelectionMap: vi.fn(),
      addToast,
    });

    expect(result).toEqual({ status: 'empty', total: 0 });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('No matching words found', 'info');
  });

  it('stops before fetching when a large selection is cancelled', async () => {
    const fetchPage = vi.fn();
    const replaceSelectionMap = vi.fn();

    const result = await selectAllMatchingWords({
      getDbTotal: () => 151,
      getExistingSelection: () => new Map(),
      fetchPage,
      requestConfirm: vi.fn(async () => false),
      replaceSelectionMap,
      addToast: vi.fn(),
    });

    expect(result).toEqual({ status: 'cancelled', total: 151 });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(replaceSelectionMap).not.toHaveBeenCalled();
  });

  it('fetches all pages and merges them into the existing selection', async () => {
    const existing = new Map<string, WordRecord>([['db:old', makeRecord('old')]]);
    const replaceSelectionMap = vi.fn();
    const addToast = vi.fn();
    const fetchPage = vi.fn(async (page: number) => ({
      items: page === 1 ? [makeRecord('one')] : [makeRecord('two')],
      page,
      totalPages: 2,
    }));

    const result = await selectAllMatchingWords({
      getDbTotal: () => 2,
      getExistingSelection: () => existing,
      fetchPage,
      requestConfirm: vi.fn(),
      replaceSelectionMap,
      addToast,
    });

    expect(result).toEqual({ status: 'selected', total: 2 });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(replaceSelectionMap).toHaveBeenCalledTimes(1);
    const selected = replaceSelectionMap.mock.calls[0][0] as Map<string, WordRecord>;
    expect([...selected.keys()].sort()).toEqual(['db:old', 'db:one', 'db:two']);
    expect(addToast).toHaveBeenCalledWith('Selected 2 matching words', 'success');
  });
});
