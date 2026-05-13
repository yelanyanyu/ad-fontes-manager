import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AnkiExportPayload } from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

const {
  buildExportPayloadMock,
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
  loadFieldMappingMock,
  saveFieldMappingMock,
  pingAnkiConnectMock,
  saveStoredAnkiExportOptionsMock,
} = vi.hoisted(() => ({
  buildExportPayloadMock: vi.fn(),
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
  checkDuplicateConflict: vi.fn(),
  ensureDeckExists: ensureDeckExistsMock,
  getDeckNames: getDeckNamesMock,
  getModelFieldNames: getModelFieldNamesMock,
  getModelNames: getModelNamesMock,
  getModelStyling: getModelStylingMock,
  getModelTemplates: getModelTemplatesMock,
  importPayloadWithStrategy: vi.fn(),
  isAnkiDuplicateConflictError: () => false,
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
    exportApkgByIdsMock.mockReset();
    exportBatchApkgViaAnkiConnectMock.mockReset();
    getDeckNamesMock.mockReset();
    getModelFieldNamesMock.mockReset();
    getModelNamesMock.mockReset();
    getModelStylingMock.mockReset();
    getModelTemplatesMock.mockReset();
    hasStoredFieldMappingMock.mockReset();
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
});
