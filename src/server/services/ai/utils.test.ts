import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('deepMerge', () => {
  void it('deep-merges objects while replacing arrays and scalars', () => {
    const { deepMerge } = require('./utils') as typeof import('./utils');

    const result = deepMerge(
      {
        yield: { lemma: 'see', language: 'en' },
        application: { selected_examples: [{ sentence: 'old' }] },
      },
      {
        yield: { language: 'de', part_of_speech: 'noun' },
        application: { selected_examples: [{ sentence: 'new' }] },
      }
    );

    assert.deepEqual(result, {
      yield: { lemma: 'see', language: 'de', part_of_speech: 'noun' },
      application: { selected_examples: [{ sentence: 'new' }] },
    });
  });
});

void describe('mergeYamlTexts', () => {
  void it('repairs quoted scalar slips before merging YAML objects', () => {
    const { mergeYamlTexts } = require('./utils') as typeof import('./utils');

    const merged = mergeYamlTexts(
      [
        'yield:',
        '  lemma: "composure"',
        'etymology:',
        '  root_and_affixes:',
        '    root: "pos" (from Latin ponere)',
      ].join('\n'),
      [
        'etymology:',
        '  visual_imagery_zh: |',
        '    杯子放稳了。',
        'nuance:',
        '  image_differentiation_zh: |',
        '    composure 有归位感。',
      ].join('\n')
    );

    assert.match(merged, /root: pos \(from Latin ponere\)/);
    assert.match(merged, /visual_imagery_zh:/);
    assert.match(merged, /image_differentiation_zh:/);
  });
});
