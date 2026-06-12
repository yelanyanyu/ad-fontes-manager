import assert from 'node:assert/strict';
import { test } from 'node:test';

const { detectWordSchema } = require('../src/server/services/word/WordSchemaDetector') as {
  detectWordSchema: (
    content: Record<string, unknown>,
    options?: {
      validateCurrent?: (content: Record<string, unknown>) => boolean;
    }
  ) => {
    declaredVersion: number | null;
    inferredVersion: number | null;
    freshness: 'current' | 'old' | 'future' | 'unknown';
    confidence: 'declared' | 'current-schema' | 'signature' | 'fallback';
    diagnostics: Array<{ code: string; message: string }>;
  };
};

void test('Word Schema Detector trusts declared Word Schema Version for freshness', () => {
  const result = detectWordSchema({
    ad_fontes: { word_schema_version: 1 },
    yield: {
      lemma: 'declared',
      word_forms: ['declared'],
    },
    etymology: {
      historical_origins: {
        source_word: {
          language: 'French',
          word: 'declared',
          meaning: 'source',
          relation: 'source',
        },
      },
    },
    word_formation: { derivations: [] },
  });

  assert.equal(result.declaredVersion, 1);
  assert.equal(result.freshness, 'old');
  assert.equal(result.confidence, 'declared');
  assert.equal(result.diagnostics[0]?.code, 'schema.declared_shape_mismatch');
});

void test('Word Schema Detector infers current when unversioned YAML passes current schema', () => {
  const result = detectWordSchema(
    { yield: { lemma: 'current' } },
    {
      validateCurrent: () => true,
    }
  );

  assert.equal(result.declaredVersion, null);
  assert.equal(result.inferredVersion, 2);
  assert.equal(result.freshness, 'current');
  assert.equal(result.confidence, 'current-schema');
});

void test('Word Schema Detector reports current-looking YAML that fails current schema', () => {
  const result = detectWordSchema(
    {
      yield: {
        lemma: 'partial',
        word_forms: ['partial'],
      },
      word_formation: { derivations: [] },
    },
    {
      validateCurrent: () => false,
    }
  );

  assert.equal(result.freshness, 'old');
  assert.equal(result.confidence, 'signature');
  assert.equal(result.diagnostics[0]?.code, 'schema.current_signature_invalid');
});

void test('Word Schema Detector falls back to old for basic unversioned Word YAML', () => {
  const result = detectWordSchema({
    yield: {
      lemma: 'legacy',
    },
  });

  assert.equal(result.freshness, 'old');
  assert.equal(result.confidence, 'fallback');
  assert.equal(result.inferredVersion, 1);
});
