import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWordExportFile, downloadWordExportFile } from './wordExportService';
import type { WordRecord } from '@/types/word-list';

const createdAnchors: Array<{ href: string; download: string; click: ReturnType<typeof vi.fn> }> =
  [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  createdAnchors.length = 0;
});

describe('buildWordExportFile', () => {
  it('exports selected Words as a versioned lossless JSON envelope', () => {
    const records: WordRecord[] = [
      {
        id: 'word-1',
        lemma: 'proliferate',
        language: 'en',
        part_of_speech: 'verb',
        content: {
          yield: {
            lemma: 'proliferate',
            contextual_meaning: { en: 'spread rapidly', zh: '快速扩散' },
          },
          application: {
            selected_examples: [{ sentence: 'Ideas proliferate.', translation_zh: '想法扩散。' }],
          },
        },
        created_at: '2026-01-01 10:00:00',
        updated_at: '2026-01-02 11:00:00',
        revision_count: 3,
      },
    ];

    const exported = buildWordExportFile(records, {
      exportedAt: '2026-06-07T00:00:00.000Z',
    });

    expect(exported).toMatchObject({
      format: 'ad-fontes.words.export',
      version: 1,
      exportedAt: '2026-06-07T00:00:00.000Z',
      items: [
        {
          id: 'word-1',
          lemma: 'proliferate',
          language: 'en',
          partOfSpeech: 'verb',
          createdAt: '2026-01-01 10:00:00',
          updatedAt: '2026-01-02 11:00:00',
          revisionCount: 3,
          content: records[0].content,
        },
      ],
    });
    expect(exported.items[0].yaml).toContain('proliferate');
    expect(exported.items[0].yaml).toContain('selected_examples');
  });
});

describe('downloadWordExportFile', () => {
  it('downloads the Word Export File as JSON', () => {
    const exportFile = buildWordExportFile(
      [
        {
          id: 'word-1',
          lemma: 'proliferate',
          language: 'en',
          content: { yield: { lemma: 'proliferate' } },
        },
      ],
      { exportedAt: '2026-06-07T00:00:00.000Z' }
    );
    const fakeBody = {
      appendChild: vi.fn((node: Node) => node),
      removeChild: vi.fn((node: Node) => node),
    };
    const fakeDocument = {
      createElement: vi.fn((tagName: string) => {
        if (tagName !== 'a') throw new Error(`Unexpected element: ${tagName}`);
        const anchor = {
          href: '',
          download: '',
          style: { display: '' },
          click: vi.fn(),
        };
        createdAnchors.push(anchor);
        return anchor as unknown as HTMLAnchorElement;
      }),
      body: fakeBody,
    };
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:word-export'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('window', {
      setTimeout: vi.fn(() => 0),
    });

    const fileName = downloadWordExportFile(exportFile, 'selected-words');

    expect(fileName).toBe('selected-words.json');
    expect(createdAnchors[0]).toMatchObject({
      href: 'blob:word-export',
      download: 'selected-words.json',
    });
    expect(createdAnchors[0].click).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });
});
