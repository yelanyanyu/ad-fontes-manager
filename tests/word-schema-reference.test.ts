import assert from 'node:assert/strict';
import { test } from 'node:test';

const { CURRENT_WORD_SCHEMA_VERSION } = require('../src/server/schemas/word/version') as {
  CURRENT_WORD_SCHEMA_VERSION: number;
};
const { getWordSchemaReference, isWordSchemaReferenceLanguage } =
  require('../src/server/services/word/WordSchemaReference') as {
    getWordSchemaReference: (language: unknown) => {
      language: 'en' | 'de';
      version: number;
      yaml: string;
    };
    isWordSchemaReferenceLanguage: (value: unknown) => boolean;
  };

void test('returns the current English word schema reference YAML', () => {
  const reference = getWordSchemaReference('en');

  assert.equal(reference.language, 'en');
  assert.equal(reference.version, CURRENT_WORD_SCHEMA_VERSION);
  assert.match(reference.yaml, /ad_fontes:\n {2}word_schema_version: 2/);
  assert.match(reference.yaml, /word_formation:/);
  assert.match(reference.yaml, /source_word:\n {6}language:/);
});

void test('returns the current German word schema reference YAML', () => {
  const reference = getWordSchemaReference('de');

  assert.equal(reference.language, 'de');
  assert.equal(reference.version, CURRENT_WORD_SCHEMA_VERSION);
  assert.match(reference.yaml, /genus:/);
  assert.match(reference.yaml, /word_formation:/);
  assert.match(reference.yaml, /pgmc_root:/);
});

void test('accepts only supported schema reference languages', () => {
  assert.equal(isWordSchemaReferenceLanguage('en'), true);
  assert.equal(isWordSchemaReferenceLanguage('de'), true);
  assert.equal(isWordSchemaReferenceLanguage('fr'), false);
  assert.equal(isWordSchemaReferenceLanguage(undefined), false);
});
