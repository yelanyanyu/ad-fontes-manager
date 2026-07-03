import { describe, expect, test } from 'vitest';
import { buildAnkiFields, extractBySource, extractLemma } from '@/services/ankiFieldMapper';
import type { FieldMappingConfig } from '@/types/anki';

const fixtureData = {
  yield: {
    lemma: 'test',
    user_context_sentence: 'I want to test this word.',
    other_common_meanings: ['exam', 'trial'],
  },
  application: {
    selected_examples: [
      {
        sentence: 'This is a test sentence.',
        translation_zh: '这是一个测试句。',
      },
    ],
  },
  nuance: {
    synonyms: [
      {
        word: 'exam',
        meaning_zh: '考试',
      },
    ],
  },
};

describe('ankiFieldMapper', () => {
  test('extracts every supported YAML data source', () => {
    expect(extractBySource('lemma', fixtureData)).toBeTruthy();
    expect(extractBySource('user_context_sentence', fixtureData)).toBeTruthy();
    expect(extractBySource('other_common_meanings', fixtureData)).toContain('||');
    expect(extractBySource('selected_examples_sentence', fixtureData)).toBeTruthy();
    expect(extractBySource('selected_examples_translation', fixtureData)).toBeTruthy();
    expect(extractBySource('synonyms_word', fixtureData)).toBeTruthy();
    expect(extractBySource('synonyms_meaning', fixtureData)).toBeTruthy();
    expect(extractBySource('rendered_html', fixtureData)).toContain('<div');
  });

  test('builds target fields from configurable source-to-target entries', () => {
    const mapping: FieldMappingConfig = [
      { source: 'lemma', target: 'Front' },
      { source: 'user_context_sentence', target: 'Context' },
      { source: 'rendered_html', target: 'Back' },
    ];

    const fields = buildAnkiFields(fixtureData, mapping);

    expect(fields.Front).toBe(extractLemma(fixtureData));
    expect(fields.Context).toBe(extractBySource('user_context_sentence', fixtureData));
    expect(fields.Back).toContain('<div');
  });

  test('uses an empty string when optional source data is absent', () => {
    const fields = buildAnkiFields({ yield: { lemma: 'porto' } }, [
      { source: 'selected_examples_sentence', target: 'Example' },
      { source: 'synonyms_meaning', target: 'Synonyms' },
    ]);

    expect(fields).toEqual({
      Example: '',
      Synonyms: '',
    });
  });
});
