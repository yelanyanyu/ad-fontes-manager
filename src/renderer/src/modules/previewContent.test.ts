import { describe, expect, it } from 'vitest';
import { buildPreviewContent } from './previewContent';

describe('buildPreviewContent', () => {
  it('renders parseable old Word Content without requiring the current schema', () => {
    const preview = buildPreviewContent(`
yield:
  lemma: legacy
  part_of_speech: noun
  contextual_meaning:
    en: old meaning
`);

    expect(preview.status).toBe('ready');
    expect(preview.schemaFreshness).toBe('old');
    expect(preview.html).toContain('legacy');
  });

  it('marks future Word Content as previewable but not current', () => {
    const preview = buildPreviewContent({
      ad_fontes: { word_schema_version: 999 },
      yield: {
        lemma: 'future',
        part_of_speech: 'noun',
        contextual_meaning: { en: 'future meaning' },
      },
    });

    expect(preview.status).toBe('ready');
    expect(preview.schemaFreshness).toBe('future');
    expect(preview.html).toContain('future');
  });

  it('reports parse errors without throwing', () => {
    const preview = buildPreviewContent('yield:\n  lemma: [broken\n');

    expect(preview.status).toBe('parse-error');
    expect(preview.rawData).toBeNull();
    expect(preview.html).toBe('');
    expect(preview.error).toBeTruthy();
  });
});
