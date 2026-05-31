import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AnkiExportPayload } from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

const {
  buildExportPayloadMock,
  checkDuplicateConflictMock,
  exportApkgByIdsMock,
  exportBatchApkgViaAnkiConnectMock,
  ensureDeckExistsMock,
  getDeckNamesMock,
  getDefaultAnkiOptionsMock,
  getInitialAnkiExportOptionsMock,
  getModelFieldNamesMock,
  getModelNamesMock,
  getModelStylingMock,
  getModelTemplatesMock,
  hasStoredFieldMappingMock,
  importPayloadWithStrategyMock,
  isAnkiDuplicateConflictErrorMock,
  loadFieldMappingMock,
  saveFieldMappingMock,
  pingAnkiConnectMock,
  saveStoredAnkiExportOptionsMock,
} = vi.hoisted(() => ({
  buildExportPayloadMock: vi.fn(),
  checkDuplicateConflictMock: vi.fn(),
  exportApkgByIdsMock: vi.fn(),
  exportBatchApkgViaAnkiConnectMock: vi.fn(),
  ensureDeckExistsMock: vi.fn(),
  getDeckNamesMock: vi.fn(),
  getDefaultAnkiOptionsMock: vi.fn(),
  getInitialAnkiExportOptionsMock: vi.fn(),
  getModelFieldNamesMock: vi.fn(),
  getModelNamesMock: vi.fn(),
  getModelStylingMock: vi.fn(),
  getModelTemplatesMock: vi.fn(),
  hasStoredFieldMappingMock: vi.fn(),
  importPayloadWithStrategyMock: vi.fn(),
  isAnkiDuplicateConflictErrorMock: vi.fn(),
  loadFieldMappingMock: vi.fn(),
  saveFieldMappingMock: vi.fn(),
  pingAnkiConnectMock: vi.fn(),
  saveStoredAnkiExportOptionsMock: vi.fn(),
}));

vi.mock('@/services/ankiPayloadBuilder', () => ({
  buildExportPayload: buildExportPayloadMock,
}));

vi.mock('@/services/apkgExportService', () => ({
  exportApkgByIds: exportApkgByIdsMock,
  exportBatchApkgViaAnkiConnect: exportBatchApkgViaAnkiConnectMock,
}));

vi.mock('@/services/ankiConnectService', () => ({
  checkDuplicateConflict: checkDuplicateConflictMock,
  ensureDeckExists: ensureDeckExistsMock,
  getDeckNames: getDeckNamesMock,
  getModelFieldNames: getModelFieldNamesMock,
  getModelNames: getModelNamesMock,
  getModelStyling: getModelStylingMock,
  getModelTemplates: getModelTemplatesMock,
  importPayloadWithStrategy: importPayloadWithStrategyMock,
  isAnkiDuplicateConflictError: isAnkiDuplicateConflictErrorMock,
  pingAnkiConnect: pingAnkiConnectMock,
}));

vi.mock('@/services/ankiExportService', () => ({
  getDefaultAnkiOptions: getDefaultAnkiOptionsMock,
}));

vi.mock('@/services/ankiExportOptionsStore', () => ({
  getInitialAnkiExportOptions: getInitialAnkiExportOptionsMock,
  saveStoredAnkiExportOptions: saveStoredAnkiExportOptionsMock,
}));

vi.mock('@/services/ankiFieldMappingStore', () => ({
  getRecommendedMapping: () => [{ source: 'lemma', target: 'Word' }],
  hasStoredFieldMapping: hasStoredFieldMappingMock,
  loadFieldMapping: loadFieldMappingMock,
  saveFieldMapping: saveFieldMappingMock,
}));

describe('useBatchAnkiExport', () => {
  let useBatchAnkiExport: typeof import('@/composables/useBatchAnkiExport').useBatchAnkiExport;

  const payload: AnkiExportPayload = {
    fields: {
      Word: 'craft',
      Context: 'She honed her craft.',
      notes: '',
      Back: '<p>detail</p>',
      Media: '',
    },
    options: {
      deckName: 'English::Words',
      modelName: 'AdFontesWord',
      tags: ['English::type::word'],
    },
    sourceWordId: 'word-1',
    sourceLemma: 'craft',
    fieldMapping: [{ source: 'lemma', target: 'Word' }],
  };

  const records: WordRecord[] = [
    {
      id: 'word-1',
      lemma: 'craft',
      isLocal: true,
    } as WordRecord,
    {
      id: 'word-2',
      lemma: 'forge',
      isLocal: true,
    } as WordRecord,
  ];

  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.resetModules();
    buildExportPayloadMock.mockReset();
    checkDuplicateConflictMock.mockReset();
    exportApkgByIdsMock.mockReset();
    exportBatchApkgViaAnkiConnectMock.mockReset();
    getDeckNamesMock.mockReset();
    getModelFieldNamesMock.mockReset();
    getModelNamesMock.mockReset();
    getModelStylingMock.mockReset();
    getModelTemplatesMock.mockReset();
    hasStoredFieldMappingMock.mockReset();
    importPayloadWithStrategyMock.mockReset();
    isAnkiDuplicateConflictErrorMock.mockReset();
    loadFieldMappingMock.mockReset();
    saveFieldMappingMock.mockReset();
    pingAnkiConnectMock.mockReset();
    getDefaultAnkiOptionsMock.mockReset();
    getInitialAnkiExportOptionsMock.mockReset();
    saveStoredAnkiExportOptionsMock.mockReset();

    getDefaultAnkiOptionsMock.mockReturnValue({
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      tags: payload.options.tags,
    });
    getInitialAnkiExportOptionsMock.mockReturnValue({});
    pingAnkiConnectMock.mockResolvedValue(6);
    getDeckNamesMock.mockResolvedValue([payload.options.deckName]);
    getModelNamesMock.mockResolvedValue([payload.options.modelName]);
    getModelFieldNamesMock.mockResolvedValue(['Word', 'Context', 'Back']);
    getModelStylingMock.mockResolvedValue('.card { color: #222; }');
    getModelTemplatesMock.mockResolvedValue([
      { name: 'Forward', front: '{{Word}}', back: '{{Back}}' },
    ]);
    hasStoredFieldMappingMock.mockReturnValue(true);
    isAnkiDuplicateConflictErrorMock.mockReturnValue(false);
    loadFieldMappingMock.mockReturnValue(payload.fieldMapping);
    buildExportPayloadMock.mockImplementation(async (record: WordRecord) => ({
      ...payload,
      fields: {
        ...payload.fields,
        Word: String(record.lemma || ''),
      },
      sourceWordId: String(record.id),
      sourceLemma: String(record.lemma || ''),
    }));
    exportBatchApkgViaAnkiConnectMock.mockResolvedValue({
      ok: true,
      fileName: 'english-words-batch.apkg',
    });
    exportApkgByIdsMock.mockResolvedValue({
      ok: true,
      fileName: 'english-words-batch.apkg',
    });
    importPayloadWithStrategyMock.mockResolvedValue({ noteId: 123, mode: 'added' });

    ({ useBatchAnkiExport } = await import('@/composables/useBatchAnkiExport'));
  });

  it('exports selected records as .apkg without duplicate preflight', async () => {
    const batch = useBatchAnkiExport();
    await batch.open(records);

    await batch.exportApkg();

    expect(buildExportPayloadMock).toHaveBeenCalledTimes(2);
    expect(exportBatchApkgViaAnkiConnectMock).toHaveBeenCalledTimes(1);
    expect(exportBatchApkgViaAnkiConnectMock.mock.calls[0][0]).toHaveLength(2);
    expect(exportBatchApkgViaAnkiConnectMock.mock.calls[0][4]).toBe('.card { color: #222; }');
  });

  it('uses backend by-ids export for large batches', async () => {
    const largeRecords = Array.from({ length: 101 }, (_, index) => ({
      id: `word-${index + 1}`,
      lemma: `word${index + 1}`,
      isLocal: true,
    })) as WordRecord[];
    const batch = useBatchAnkiExport();
    await batch.open(largeRecords);

    await batch.exportApkg();

    expect(buildExportPayloadMock).not.toHaveBeenCalled();
    expect(exportBatchApkgViaAnkiConnectMock).not.toHaveBeenCalled();
    expect(exportApkgByIdsMock).toHaveBeenCalledWith(
      largeRecords.map(record => String(record.id)),
      payload.fieldMapping,
      payload.options,
      ['Word', 'Context', 'Back'],
      { name: 'Forward', front: '{{Word}}', back: '{{Back}}' },
      '.card { color: #222; }',
      'English::Words-batch.apkg'
    );
  });

  it('overwrites duplicate cards after the duplicate import decision', async () => {
    const { checkDuplicateConflict } = await import('@/services/ankiConnectService');
    const checkDuplicateConflictMock = vi.mocked(checkDuplicateConflict);
    checkDuplicateConflictMock
      .mockResolvedValueOnce({
        noteId: 42,
        deckName: payload.options.deckName,
        modelName: payload.options.modelName,
        word: 'craft',
        existingFields: { Word: 'craft', Back: '<p>old</p>' },
        incomingFields: payload.fields,
      })
      .mockResolvedValueOnce(null);
    importPayloadWithStrategyMock
      .mockResolvedValueOnce({ noteId: 42, mode: 'overwritten' })
      .mockResolvedValueOnce({ noteId: 43, mode: 'added' });

    const batch = useBatchAnkiExport();
    await batch.open(records);
    await batch.checkDuplicates();

    await batch.confirmDuplicateImportDecision('overwrite');

    expect(importPayloadWithStrategyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sourceWordId: 'word-1' }),
      'overwrite_if_duplicate',
      'duplicate',
      { skipPrepare: true }
    );
    expect(importPayloadWithStrategyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceWordId: 'word-2' }),
      'add_if_not_duplicate',
      'ready',
      { skipPrepare: true }
    );
    expect(batch.items.value.map(item => item.status)).toEqual(['overwritten', 'imported']);
    expect(batch.items.value.map(item => item.noteId)).toEqual([42, 43]);
  });

  it('opens a duplicate import decision when import finds duplicate cards', async () => {
    const { checkDuplicateConflict } = await import('@/services/ankiConnectService');
    const checkDuplicateConflictMock = vi.mocked(checkDuplicateConflict);
    checkDuplicateConflictMock
      .mockResolvedValueOnce({
        noteId: 42,
        deckName: payload.options.deckName,
        modelName: payload.options.modelName,
        word: 'craft',
        existingFields: { Word: 'craft', Back: '<p>old</p>' },
        incomingFields: payload.fields,
      })
      .mockResolvedValueOnce(null);

    const batch = useBatchAnkiExport();
    await batch.open(records);
    const result = await batch.importToAnki();

    expect(result.status).toBe('needsDuplicateDecision');
    expect(checkDuplicateConflictMock).toHaveBeenCalledTimes(2);
    expect(importPayloadWithStrategyMock).not.toHaveBeenCalled();
    expect(batch.duplicateImportDecisionOpen.value).toBe(true);
    expect(batch.duplicateImportDecisionSummary.value).toEqual({
      duplicateCount: 1,
      readyCount: 1,
      totalCount: 2,
    });
    expect(batch.items.value.map(item => item.status)).toEqual(['duplicate', 'ready']);
  });

  it('imports only new cards and marks duplicate cards skipped after the duplicate decision', async () => {
    checkDuplicateConflictMock
      .mockResolvedValueOnce({
        noteId: 42,
        deckName: payload.options.deckName,
        modelName: payload.options.modelName,
        word: 'craft',
        existingFields: { Word: 'craft', Back: '<p>old</p>' },
        incomingFields: payload.fields,
      })
      .mockResolvedValueOnce(null);
    importPayloadWithStrategyMock.mockResolvedValueOnce({ noteId: 43, mode: 'added' });

    const batch = useBatchAnkiExport();
    await batch.open(records);
    await batch.importToAnki();

    const result = await batch.confirmDuplicateImportDecision('skip');

    expect(result.status).toBe('completed');
    expect(importPayloadWithStrategyMock).toHaveBeenCalledTimes(1);
    expect(importPayloadWithStrategyMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceWordId: 'word-2' }),
      'add_if_not_duplicate',
      'ready',
      { skipPrepare: true }
    );
    expect(batch.items.value.map(item => item.status)).toEqual(['skipped', 'imported']);
    expect(batch.items.value[0].conflict?.noteId).toBe(42);
  });

  it('reports failed when automatic duplicate check cannot complete', async () => {
    ensureDeckExistsMock.mockRejectedValueOnce(new Error('Anki deck unavailable'));

    const batch = useBatchAnkiExport();
    await batch.open(records);
    const result = await batch.importToAnki();

    expect(result.status).toBe('failed');
    expect(result.message).toBe('Anki deck unavailable');
    expect(batch.duplicateImportDecisionOpen.value).toBe(false);
    expect(importPayloadWithStrategyMock).not.toHaveBeenCalled();
  });

  it('asks for a duplicate import decision when Anki reports a duplicate during import', async () => {
    const conflict = {
      noteId: 77,
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      word: 'craft',
      existingFields: { Word: 'craft', Back: '<p>old</p>' },
      incomingFields: payload.fields,
    };
    checkDuplicateConflictMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    importPayloadWithStrategyMock
      .mockRejectedValueOnce({ conflict })
      .mockResolvedValueOnce({ noteId: 43, mode: 'added' });
    isAnkiDuplicateConflictErrorMock.mockReturnValueOnce(true);

    const batch = useBatchAnkiExport();
    await batch.open(records);
    const result = await batch.importToAnki();

    expect(result.status).toBe('needsDuplicateDecision');
    expect(batch.duplicateImportDecisionOpen.value).toBe(true);
    expect(batch.items.value[0]).toMatchObject({
      status: 'duplicate',
      conflict,
      resolution: 'undecided',
    });
    expect(batch.items.value[1].status).toBe('imported');
  });

  it('rechecks ready cards before importing so stale ready state cannot duplicate cards', async () => {
    const conflict = {
      noteId: 88,
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      word: 'craft',
      existingFields: { Word: 'craft', Back: '<p>old</p>' },
      incomingFields: payload.fields,
    };
    checkDuplicateConflictMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(conflict)
      .mockResolvedValueOnce(null);

    const batch = useBatchAnkiExport();
    await batch.open(records);
    await batch.checkDuplicates();
    expect(batch.items.value.map(item => item.status)).toEqual(['ready', 'ready']);

    const result = await batch.importToAnki();

    expect(result.status).toBe('needsDuplicateDecision');
    expect(checkDuplicateConflictMock).toHaveBeenCalledTimes(4);
    expect(importPayloadWithStrategyMock).not.toHaveBeenCalled();
    expect(batch.items.value.map(item => item.status)).toEqual(['duplicate', 'ready']);
    expect(batch.items.value[0].conflict?.noteId).toBe(88);
  });
});
