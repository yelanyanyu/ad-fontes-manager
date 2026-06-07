import { describe, expect, it, vi } from 'vitest';
import { importWordExportFile, parseWordImportFile } from './wordImportService';

const { requestPostMock } = vi.hoisted(() => ({
  requestPostMock: vi.fn(),
}));

vi.mock('@/utils/request', () => ({
  default: {
    post: requestPostMock,
  },
}));

describe('parseWordImportFile', () => {
  it('parses the versioned Word Export JSON envelope', () => {
    const parsed = parseWordImportFile(
      JSON.stringify({
        format: 'ad-fontes.words.export',
        version: 1,
        exportedAt: '2026-06-07T00:00:00.000Z',
        items: [
          {
            lemma: 'proliferate',
            language: 'en',
            partOfSpeech: 'verb',
            content: { yield: { lemma: 'proliferate' } },
          },
        ],
      })
    );

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      lemma: 'proliferate',
      language: 'en',
      content: { yield: { lemma: 'proliferate' } },
    });
  });

  it('rejects unsupported JSON files', () => {
    expect(() => parseWordImportFile('{"items":[]}')).toThrow('Unsupported Word Import file');
  });
});

describe('importWordExportFile', () => {
  it('imports new words and skips existing lemma-language conflicts', async () => {
    requestPostMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ status: 'conflict', lemma: 'pattern' });

    const result = await importWordExportFile({
      format: 'ad-fontes.words.export',
      version: 1,
      exportedAt: '2026-06-07T00:00:00.000Z',
      items: [
        {
          lemma: 'spinal',
          language: 'en',
          content: { yield: { lemma: 'spinal' } },
        },
        {
          lemma: 'pattern',
          language: 'en',
          content: { yield: { lemma: 'pattern' } },
        },
      ],
    });

    expect(result).toEqual({
      total: 2,
      imported: 1,
      skippedConflicts: 1,
      failed: 0,
      errors: [],
    });
    expect(requestPostMock).toHaveBeenCalledWith(
      '/v2/words',
      expect.objectContaining({
        forceUpdate: false,
        yaml: expect.stringContaining('spinal'),
      }),
      { skipErrorToast: true }
    );
    expect(requestPostMock.mock.calls[0][1].yaml).toContain('language: en');
  });
});
