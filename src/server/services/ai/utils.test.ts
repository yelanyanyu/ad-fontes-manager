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

  void it('keeps app-owned Word Schema metadata from the primary YAML', () => {
    const yaml = require('js-yaml') as typeof import('js-yaml');
    const { mergeYamlTexts } = require('./utils') as typeof import('./utils');

    const merged = mergeYamlTexts(
      [
        'ad_fontes:',
        '  word_schema_version: 2',
        'yield:',
        '  lemma: composure',
        '  language: en',
      ].join('\n'),
      [
        'ad_fontes:',
        '  word_schema_version: 999',
        '  generated_by: creative-stage',
        'etymology:',
        '  visual_imagery_zh: composure image',
      ].join('\n')
    );
    const parsed = yaml.load(merged) as Record<string, any>;

    assert.deepEqual(parsed.ad_fontes, { word_schema_version: 2 });
    assert.equal(parsed.etymology.visual_imagery_zh, 'composure image');
  });

  void it('merges creative root sections even when the creative YAML repeats a field', () => {
    const yaml = require('js-yaml') as typeof import('js-yaml');
    const { mergeYamlTexts } = require('./utils') as typeof import('./utils');

    const merged = mergeYamlTexts(
      [
        'ad_fontes:',
        '  word_schema_version: 2',
        'yield:',
        '  lemma: biographer',
        '  language: en',
        'etymology:',
        '  root_and_affixes:',
        '    root: graph',
        'word_formation:',
        '  derivations:',
        '    - language: en',
        '      word: biography',
        '    - language: en',
        '      word: biographical',
      ].join('\n'),
      [
        'etymology:',
        '  visual_imagery_zh: image',
        '  meaning_evolution_zh: first',
        '  meaning_evolution_zh: second',
        'application:',
        '  selected_examples:',
        '    - sentence: example',
      ].join('\n')
    );
    const parsed = yaml.load(merged) as Record<string, any>;

    assert.equal(parsed.etymology.root_and_affixes.root, 'graph');
    assert.equal(parsed.etymology.visual_imagery_zh, 'image');
    assert.equal(parsed.etymology.meaning_evolution_zh, 'second');
    assert.equal(parsed.word_formation.derivations.length, 2);
    assert.doesNotMatch(merged, /^etymology:[\s\S]*^etymology:/m);
  });
});
