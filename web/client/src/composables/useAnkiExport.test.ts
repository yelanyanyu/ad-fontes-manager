import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiDuplicateConflict, AnkiExportPayload } from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

const {
  buildExportPayloadMock,
  checkDuplicateConflictMock,
  exportApkgViaAnkiConnectMock,
  getDeckNamesMock,
  getDefaultAnkiOptionsMock,
  getInitialAnkiExportOptionsMock,
  getModelNamesMock,
  importPayloadWithStrategyMock,
  pingAnkiConnectMock,
  saveStoredAnkiExportOptionsMock,
  mockDuplicateConflictError,
  mockImportStateMismatchError,
} = vi.hoisted(() => {
  class MockDuplicateConflictError extends Error {
    conflict: AnkiDuplicateConflict;

    constructor(conflict: AnkiDuplicateConflict) {
      super('duplicate');
      this.conflict = conflict;
    }
  }

  class MockImportStateMismatchError extends Error {
    actualState: 'ready' | 'duplicate';

    constructor(actualState: 'ready' | 'duplicate') {
      super('mismatch');
      this.actualState = actualState;
    }
  }

  return {
    buildExportPayloadMock: vi.fn(),
    checkDuplicateConflictMock: vi.fn(),
    exportApkgViaAnkiConnectMock: vi.fn(),
    getDeckNamesMock: vi.fn(),
    getDefaultAnkiOptionsMock: vi.fn(),
    getInitialAnkiExportOptionsMock: vi.fn(),
    getModelNamesMock: vi.fn(),
    importPayloadWithStrategyMock: vi.fn(),
    pingAnkiConnectMock: vi.fn(),
    saveStoredAnkiExportOptionsMock: vi.fn(),
    mockDuplicateConflictError: MockDuplicateConflictError,
    mockImportStateMismatchError: MockImportStateMismatchError,
  };
});

vi.mock('@/services/ankiPayloadBuilder', () => ({
  buildExportPayload: buildExportPayloadMock,
}));

vi.mock('@/services/ankiExportService', () => ({
  getDefaultAnkiOptions: getDefaultAnkiOptionsMock,
}));

vi.mock('@/services/ankiExportOptionsStore', () => ({
  getInitialAnkiExportOptions: getInitialAnkiExportOptionsMock,
  saveStoredAnkiExportOptions: saveStoredAnkiExportOptionsMock,
}));

vi.mock('@/services/apkgExportService', () => ({
  exportApkgViaAnkiConnect: exportApkgViaAnkiConnectMock,
}));

vi.mock('@/services/ankiConnectService', () => ({
  checkDuplicateConflict: checkDuplicateConflictMock,
  getDeckNames: getDeckNamesMock,
  getModelNames: getModelNamesMock,
  importPayloadWithStrategy: importPayloadWithStrategyMock,
  isAnkiDuplicateConflictError: (error: unknown) => error instanceof mockDuplicateConflictError,
  isAnkiImportStateMismatchError: (error: unknown) => error instanceof mockImportStateMismatchError,
  pingAnkiConnect: pingAnkiConnectMock,
}));

const record: WordRecord = {
  id: 'word-1',
  lemma: 'craft',
};

const payload: AnkiExportPayload = {
  fields: {
    Word: 'craft',
    Context: 'updated context',
    notes: '',
    Back: '<p>updated back</p>',
    'Add Reverse': '',
    Media: '',
  },
  options: {
    deckName: 'English::English-word',
    modelName: 'Quizify',
    addReverse: false,
    tags: ['English::type::word'],
  },
  sourceWordId: 'word-1',
  sourceLemma: 'craft',
};

const duplicateConflict: AnkiDuplicateConflict = {
  noteId: 1748477521514,
  deckName: payload.options.deckName,
  modelName: payload.options.modelName,
  word: 'craft',
  existingFields: payload.fields,
  incomingFields: payload.fields,
};

describe('useAnkiExport', () => {
  let useAnkiExport: typeof import('@/composables/useAnkiExport').useAnkiExport;

  beforeEach(async () => {
    vi.resetModules();
    buildExportPayloadMock.mockReset();
    checkDuplicateConflictMock.mockReset();
    exportApkgViaAnkiConnectMock.mockReset();
    getDeckNamesMock.mockReset();
    getDefaultAnkiOptionsMock.mockReset();
    getInitialAnkiExportOptionsMock.mockReset();
    getModelNamesMock.mockReset();
    importPayloadWithStrategyMock.mockReset();
    pingAnkiConnectMock.mockReset();
    saveStoredAnkiExportOptionsMock.mockReset();

    getDefaultAnkiOptionsMock.mockReturnValue({
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      addReverse: false,
      tags: payload.options.tags,
    });
    getInitialAnkiExportOptionsMock.mockReturnValue({});
    buildExportPayloadMock.mockResolvedValue(payload);
    pingAnkiConnectMock.mockResolvedValue(6);
    getDeckNamesMock.mockResolvedValue([payload.options.deckName]);
    getModelNamesMock.mockResolvedValue([payload.options.modelName]);

    ({ useAnkiExport } = await import('@/composables/useAnkiExport'));
  });

  it('marks duplicate state when opening a record with an existing note', async () => {
    checkDuplicateConflictMock.mockResolvedValue(duplicateConflict);

    const exportState = useAnkiExport();
    await exportState.open(record);

    expect(exportState.duplicateState.value).toBe('duplicate');
    expect(exportState.duplicateConflict.value).toEqual(duplicateConflict);
  });

  it('sets duplicate state to ready after an overwrite', async () => {
    checkDuplicateConflictMock.mockResolvedValue(duplicateConflict);
    importPayloadWithStrategyMock.mockResolvedValue({
      noteId: duplicateConflict.noteId,
      mode: 'overwritten',
      changedFieldNames: ['Back'],
    });

    const exportState = useAnkiExport();
    await exportState.open(record);
    const result = await exportState.importToAnki();

    expect(result).toEqual({
      status: 'overwritten',
      noteId: duplicateConflict.noteId,
    });
    expect(exportState.duplicateState.value).toBe('ready');
    expect(exportState.duplicateConflict.value).toBeNull();
    expect(checkDuplicateConflictMock).toHaveBeenCalledTimes(2);
  });

  it('treats non-overwrite import results as imported and clears duplicate conflict', async () => {
    checkDuplicateConflictMock.mockResolvedValue(duplicateConflict);
    importPayloadWithStrategyMock.mockResolvedValue({
      noteId: duplicateConflict.noteId,
      mode: 'unchanged',
      changedFieldNames: [],
    });

    const exportState = useAnkiExport();
    await exportState.open(record);
    const result = await exportState.importToAnki();

    expect(result).toEqual({
      status: 'imported',
      noteId: duplicateConflict.noteId,
    });
    expect(exportState.duplicateState.value).toBe('ready');
    expect(exportState.duplicateConflict.value).toBeNull();
    expect(checkDuplicateConflictMock).toHaveBeenCalledTimes(2);
  });

  it('restores duplicate state when import detects a duplicate after preflight said ready', async () => {
    checkDuplicateConflictMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(duplicateConflict);
    importPayloadWithStrategyMock.mockRejectedValue(new mockImportStateMismatchError('duplicate'));

    const exportState = useAnkiExport();
    await exportState.open(record);

    await expect(exportState.importToAnki()).rejects.toThrow('mismatch');
    expect(exportState.duplicateState.value).toBe('duplicate');
    expect(exportState.duplicateConflict.value).toEqual(duplicateConflict);
  });
});
