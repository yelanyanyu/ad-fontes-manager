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
