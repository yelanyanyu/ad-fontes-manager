const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const validatorPath = path.resolve(__dirname, '../services/word/WordValidator.ts');

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

function buildValidWordData(): Record<string, unknown> {
  return {
    root: { source: 'test' },
    yield: {
      user_word: 'Lumen',
      lemma: 'lumen',
      syllabification: 'lu-men',
      user_context_sentence: 'The lumen brightened the room.',
      part_of_speech: 'noun',
      contextual_meaning: {
        en: 'light',
        zh: 'light-zh',
      },
      other_common_meanings: ['clarity'],
    },
    etymology: {
      root_and_affixes: {
        prefix: 'lu',
        root: 'men',
        suffix: 'n',
        structure_analysis: 'prefix + root + suffix',
      },
      historical_origins: {
        history_myth: 'myth',
        source_word: 'lumen',
        pie_root: 'leuk',
      },
      visual_imagery_zh: 'visual-image',
      meaning_evolution_zh: 'meaning-evolution',
    },
    cognate_family: {
      cognates: [{ word: 'illuminate', logic: 'shared light root' }],
    },
    application: {
      selected_examples: [
        {
          type: 'example',
          sentence: 'A lumen output chart.',
          translation_zh: 'lumen-output-chart',
        },
      ],
    },
    nuance: {
      image_differentiation_zh: 'semantic-diff',
      synonyms: [{ word: 'light', meaning_zh: 'light-zh' }],
    },
  };
}

test('WordValidator validates correct payload successfully', () => {
  const validator = freshRequire(validatorPath);
  const result = validator.validate(buildValidWordData(), 'lumen');

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('WordValidator keeps lemma business rule compatibility', () => {
  const validator = freshRequire(validatorPath);
  const result = validator.validate(buildValidWordData(), 'lumina');

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['yield.lemma must match word']);
});

test('WordValidator converts structure errors to legacy error messages', () => {
  const validator = freshRequire(validatorPath);
  const invalid = buildValidWordData();
  delete (invalid as { yield?: unknown }).yield;

  const result = validator.validate(invalid, 'lumen');

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes('yield is required'), true);
});

test('WordValidator reports root object errors', () => {
  const validator = freshRequire(validatorPath);
  const invalid = buildValidWordData();
  (invalid as { root?: unknown }).root = 'invalid-root';

  const result = validator.validate(invalid, 'lumen');

  assert.equal(result.valid, false);
  assert.equal(result.errors.includes('root must be an object'), true);
});
