import assert from 'node:assert/strict';
import { test } from 'node:test';

const wordService = require('../src/server/services/word/WordServiceV2') as {
  validateYaml: (
    req: Record<string, unknown>,
    yaml: string,
    options?: {
      repair?: boolean;
      intent?: 'create' | 'update-existing';
      wordId?: string | number | null;
      baseWordSchemaVersion?: number | null;
    }
  ) => Promise<{
    valid: boolean;
    canSave?: boolean;
    notices?: string[];
    schemaFreshness?: 'current' | 'old' | 'future';
  }>;
};

const currentEnglishYamlWithoutMetadata = [
  'yield:',
  '  user_word: abandon',
  '  lemma: abandon',
  '  syllabification: a-ban-don',
  '  word_forms:',
  '    - abandon',
  '  user_context_sentence: ""',
  '  part_of_speech: verb',
  '  contextual_meaning:',
  '    en: to leave behind',
  '    zh: 放弃',
  '  other_common_meanings:',
  '    - to give up',
  'etymology:',
  '  root_and_affixes:',
  '    prefix: a-',
  '    root: band',
  '    suffix: -on',
  '    structure_analysis: a structure note',
  '  historical_origins:',
  '    history_myth: a history note',
  '    source_word:',
  '      language: French',
  '      word: abandonner',
  '      meaning: surrender',
  '      relation: source',
  '    pie_root: "*bha-"',
  '  visual_imagery_zh: 一个人离开旧计划',
  '  meaning_evolution_zh: 从交付到放弃',
  'word_formation:',
  '  derivations:',
  '    - language: French',
  '      word: abandonner',
  '      part_of_speech: verb',
  '      relation: source',
  '      logic: related formation',
  'cognate_family:',
  '  cognates:',
  '    - word: abandonner',
  '      language: French',
  '      relation: source',
  '      logic: French source form',
  'application:',
  '  selected_examples:',
  '    - type: daily',
  '      sentence: He decided to abandon the plan.',
  '      translation_zh: 他决定放弃这个计划。',
  'nuance:',
  '  image_differentiation_zh: abandon 强调主动离开',
  '  synonyms:',
  '    - word: desert',
  '      meaning_zh: 遗弃',
].join('\n');

void test('strict validate treats editor YAML without hidden app metadata as current for new words', async () => {
  const result = await wordService.validateYaml(
    {},
    [
      'yield:',
      '  user_word: abandon',
      '  lemma: abandon',
      '  syllabification: a-ban-don',
      '  user_context_sentence: ""',
      '  part_of_speech: verb',
      '  contextual_meaning:',
      '    en: to leave behind',
      '    zh: 放弃',
      '  other_common_meanings:',
      '    - to give up',
    ].join('\n'),
    {
      repair: false,
      intent: 'create',
    }
  );

  assert.equal(result.schemaFreshness, 'current');
});

void test('strict validate upgrades current-shaped YAML while editing an old word', async () => {
  const result = await wordService.validateYaml({}, currentEnglishYamlWithoutMetadata, {
    repair: false,
    intent: 'update-existing',
    baseWordSchemaVersion: 1,
  });

  assert.equal(result.valid, true);
  assert.equal(result.canSave, true);
  assert.equal(result.schemaFreshness, 'current');
  assert.equal(result.notices?.length ?? 0, 0);
});

void test('strict validate still respects an explicitly future Word Schema Version', async () => {
  const result = await wordService.validateYaml(
    {},
    [
      'ad_fontes:',
      '  word_schema_version: 999',
      'yield:',
      '  user_word: future',
      '  lemma: future',
    ].join('\n'),
    {
      repair: false,
      intent: 'create',
    }
  );

  assert.equal(result.schemaFreshness, 'future');
});

void test('strict validate uses the editor session base version when app metadata is hidden', async () => {
  const result = await wordService.validateYaml(
    {},
    ['yield:', '  user_word: legacy', '  lemma: legacy'].join('\n'),
    {
      repair: false,
      intent: 'update-existing',
      baseWordSchemaVersion: 1,
    }
  );

  assert.equal(result.schemaFreshness, 'old');
});

void test('strict validate allows lossless edits for an old word identified by editor session context', async () => {
  const result = await wordService.validateYaml(
    {},
    ['yield:', '  user_word: legacy', '  lemma: legacy'].join('\n'),
    {
      repair: false,
      intent: 'update-existing',
      baseWordSchemaVersion: 1,
    }
  );

  assert.equal(result.valid, true);
  assert.equal(result.canSave, true);
  assert.equal(result.schemaFreshness, 'old');
  assert.equal(result.notices?.length, 1);
});
