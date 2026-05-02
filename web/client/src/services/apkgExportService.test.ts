import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiExportPayload, AnkiModelTemplate } from '@/types/anki';

const { downloadPayloadsAsApkgMock } = vi.hoisted(() => ({
  downloadPayloadsAsApkgMock: vi.fn(),
}));

vi.mock('@/services/ankiConnectService', () => ({
  downloadPayloadsAsApkg: downloadPayloadsAsApkgMock,
}));

import {
  exportApkgViaAnkiConnect,
  exportBatchApkgViaAnkiConnect,
} from '@/services/apkgExportService';

const makeApkgBlob = (): Blob => {
  const bytes = new Uint8Array(24);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  bytes.set([0x50, 0x4b, 0x05, 0x06], 20);
  return new Blob([bytes]);
};

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
};

const selectedTemplate: AnkiModelTemplate = {
  name: 'Forward',
  front: '{{Word}}',
  back: '{{Back}}',
};

describe('apkgExportService', () => {
  beforeEach(() => {
    downloadPayloadsAsApkgMock.mockReset();
    downloadPayloadsAsApkgMock.mockResolvedValue(makeApkgBlob());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('document', {
      createElement: () => ({
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      }),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
    vi.stubGlobal('window', {
      setTimeout: vi.fn(),
    });
  });

  it('includes css in single APKG export requests', async () => {
    await exportApkgViaAnkiConnect(
      payload,
      'words.apkg',
      ['Word', 'Context', 'Back'],
      selectedTemplate,
      '.card { color: #222; }'
    );

    expect(downloadPayloadsAsApkgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        css: '.card { color: #222; }',
      })
    );
  });

  it('warns but still sends empty css in batch APKG export requests', async () => {
    await exportBatchApkgViaAnkiConnect(
      [payload],
      'words.apkg',
      ['Word', 'Context', 'Back'],
      selectedTemplate,
      ''
    );

    expect(console.warn).toHaveBeenCalledWith(
      'Model CSS is empty. The exported .apkg will use Anki default styling.'
    );
    expect(downloadPayloadsAsApkgMock).toHaveBeenCalledWith(
      expect.objectContaining({
        css: '',
      })
    );
  });
});
