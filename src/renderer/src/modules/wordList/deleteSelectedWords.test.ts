import { describe, expect, it, vi } from 'vitest';
import {
  buildBulkDeleteConfirmOptions,
  deleteSelectedWords,
  getDeletableWordIds,
} from '@/modules/wordList/deleteSelectedWords';
import type { WordRecord } from '@/types/word-list';

const makeRecord = (id: string, isLocal = false): WordRecord =>
  ({
    id,
    isLocal,
  }) as WordRecord;

describe('deleteSelectedWords', () => {
  it('ignores local and id-less records when building deletable ids', () => {
    expect(getDeletableWordIds([makeRecord('db-1'), makeRecord('local-1', true)])).toEqual([
      'db-1',
    ]);
  });

  it('requires typed confirmation for more than 20 selected words', () => {
    expect(buildBulkDeleteConfirmOptions(21)).toMatchObject({
      requiredText: '确认删除',
      requiredTextLabel: '输入“确认删除”以继续。',
      requiredTextPlaceholder: '确认删除',
    });
    expect(buildBulkDeleteConfirmOptions(20)).toMatchObject({
      requiredText: '',
      requiredTextLabel: '',
      requiredTextPlaceholder: '',
    });
  });

  it('does nothing when no database words are selected', async () => {
    const requestConfirm = vi.fn();
    const deleteWords = vi.fn();

    const result = await deleteSelectedWords({
      getSelectedRecords: () => [makeRecord('local-1', true)],
      requestConfirm,
      deleteWords,
      clearSelection: vi.fn(),
    });

    expect(result).toEqual({ status: 'empty', count: 0 });
    expect(requestConfirm).not.toHaveBeenCalled();
    expect(deleteWords).not.toHaveBeenCalled();
  });

  it('deletes confirmed database words and clears selection', async () => {
    const deleteWords = vi.fn(async () => undefined);
    const clearSelection = vi.fn();

    const result = await deleteSelectedWords({
      getSelectedRecords: () => [makeRecord('one'), makeRecord('two')],
      requestConfirm: vi.fn(async () => true),
      deleteWords,
      clearSelection,
    });

    expect(result).toEqual({ status: 'deleted', count: 2 });
    expect(deleteWords).toHaveBeenCalledWith(['one', 'two']);
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });
});
