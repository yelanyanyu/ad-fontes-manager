const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const fieldExtractorPath = path.resolve(__dirname, '../services/anki/fieldExtractor.ts');

const { buildAnkiFields, extractBySource } = require(fieldExtractorPath) as {
  buildAnkiFields: (
    data: Record<string, unknown>,
    mapping: Array<{ source: string; target: string }>
  ) => Record<string, string>;
  extractBySource: (source: string, data: Record<string, unknown>) => string;
};

const wordContent = {
  yield: {
    lemma: 'craft',
    user_word: 'craft',
    user_context_sentence: 'She honed her craft.',
    other_common_meanings: ['skill', 'trade'],
    contextual_meaning: {
      en: 'skill in making things',
      zh: '技艺',
    },
  },
  application: {
    selected_examples: [
      {
        sentence: 'The craft takes patience.',
        translation_zh: '这门技艺需要耐心。',
      },
    ],
  },
  nuance: {
    synonyms: [
      {
        word: 'skill',
        meaning_zh: '技能',
      },
    ],
  },
};

test('buildAnkiFields should map configured sources to target fields', () => {
  const fields = buildAnkiFields(wordContent, [
    { source: 'lemma', target: 'Word' },
    { source: 'user_context_sentence', target: 'Context' },
    { source: 'other_common_meanings', target: 'Meanings' },
    { source: 'selected_examples_sentence', target: 'Example' },
    { source: 'selected_examples_translation', target: 'Translation' },
    { source: 'synonyms_word', target: 'Synonym' },
    { source: 'synonyms_meaning', target: 'SynonymMeaning' },
  ]);

  assert.deepEqual(fields, {
    Word: 'craft',
    Context: 'She honed her craft.',
    Meanings: 'skill||trade',
    Example: 'The craft takes patience.',
    Translation: '这门技艺需要耐心。',
    Synonym: 'skill',
    SynonymMeaning: '技能',
  });
});

test('extractBySource should render the shared card HTML', () => {
  const html = extractBySource('rendered_html', wordContent);

  assert.match(html, /font-family/);
  assert.match(html, /craft/);
  assert.match(html, /User context: "craft"/);
  assert.match(html, /技艺/);
});
