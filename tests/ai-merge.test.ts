import assert from 'node:assert/strict';
import { test } from 'node:test';

const yaml = require('js-yaml') as typeof import('js-yaml');
const { mergeYamlTexts } =
  require('../src/server/services/ai/utils') as typeof import('../src/server/services/ai/utils');

function asRecord(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

void test('mergeYamlTexts keeps research historical origins when creative output has the wrong shape', () => {
  const researchYaml = `
yield:
  lemma: dish
  language: en
etymology:
  root_and_affixes:
    prefix: N/A
    root: dish
    suffix: N/A
    structure_analysis: root word
  historical_origins:
    history_myth: From Latin discus through Germanic.
    source_word:
      language: la
      word: discus
      meaning: disc, platter
      relation: derived_from
    pie_root: N/A
`;
  const creativeYaml = `
etymology:
  historical_origins:
    - note: Greek diskos may derive from PIE, but English uses the Latin path.
  visual_imagery_zh: 白盘子叠在木架上。
`;

  const merged = yaml.load(mergeYamlTexts(researchYaml, creativeYaml)) as Record<string, unknown>;
  const etymology = asRecord(merged.etymology);
  const historicalOrigins = asRecord(etymology.historical_origins);

  assert.equal(historicalOrigins.history_myth, 'From Latin discus through Germanic.');
  assert.equal(asRecord(historicalOrigins.source_word).word, 'discus');
  assert.equal(etymology.visual_imagery_zh, '白盘子叠在木架上。');
});
