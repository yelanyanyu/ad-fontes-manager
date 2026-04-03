import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AnkiExportPayload } from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

const {
  buildExportPayloadMock,
  exportBatchApkgViaAnkiConnectMock,
  getDeckNamesMock,
  getDefaultAnkiOptionsMock,
  getInitialAnkiExportOptionsMock,
  getModelNamesMock,
  pingAnkiConnectMock,
  saveStoredAnkiExportOptionsMock,
} = vi.hoisted(() => ({
  buildExportPayloadMock: vi.fn(),
  exportBatchApkgViaAnkiConnectMock: vi.fn(),
  getDeckNamesMock: vi.fn(),
  getDefaultAnkiOptionsMock: vi.fn(),
  getInitialAnkiExportOptionsMock: vi.fn(),
  getModelNamesMock: vi.fn(),
  pingAnkiConnectMock: vi.fn(),
  saveStoredAnkiExportOptionsMock: vi.fn(),
}));

vi.mock('@/services/ankiPayloadBuilder', () => ({
  buildExportPayload: buildExportPayloadMock,
}));

vi.mock('@/services/apkgExportService', () => ({
  exportBatchApkgViaAnkiConnect: exportBatchApkgViaAnkiConnectMock,
}));

vi.mock('@/services/ankiConnectService', () => ({
  checkDuplicateConflict: vi.fn(),
  getDeckNames: getDeckNamesMock,
  getModelNames: getModelNamesMock,
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

describe('useBatchAnkiExport', () => {
  let useBatchAnkiExport: typeof import('@/composables/useBatchAnkiExport').useBatchAnkiExport;

  const payload: AnkiExportPayload = {
    fields: {
      Word: 'craft',
      Context: 'She honed her craft.',
      notes: '',
      Back: '<p>detail</p>',
      'Add Reverse': 'true',
      Media: '',
    },
    options: {
      deckName: 'English::Words',
      modelName: 'AdFontesWord',
      addReverse: true,
      tags: ['English::type::word'],
    },
    sourceWordId: 'word-1',
    sourceLemma: 'craft',
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
    exportBatchApkgViaAnkiConnectMock.mockReset();
    getDeckNamesMock.mockReset();
    getModelNamesMock.mockReset();
    pingAnkiConnectMock.mockReset();
    getDefaultAnkiOptionsMock.mockReset();
    getInitialAnkiExportOptionsMock.mockReset();
    saveStoredAnkiExportOptionsMock.mockReset();

    getDefaultAnkiOptionsMock.mockReturnValue({
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      addReverse: true,
      tags: payload.options.tags,
    });
    getInitialAnkiExportOptionsMock.mockReturnValue({});
    pingAnkiConnectMock.mockResolvedValue(6);
    getDeckNamesMock.mockResolvedValue([payload.options.deckName]);
    getModelNamesMock.mockResolvedValue([payload.options.modelName]);
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

    ({ useBatchAnkiExport } = await import('@/composables/useBatchAnkiExport'));
  });

  it('exports selected records as .apkg without duplicate preflight', async () => {
    const batch = useBatchAnkiExport();
    await batch.open(records);

    await batch.exportApkg();

    expect(buildExportPayloadMock).toHaveBeenCalledTimes(2);
    expect(exportBatchApkgViaAnkiConnectMock).toHaveBeenCalledTimes(1);
    expect(exportBatchApkgViaAnkiConnectMock.mock.calls[0][0]).toHaveLength(2);
  });
});

