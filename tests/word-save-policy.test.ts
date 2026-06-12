import assert from 'node:assert/strict';
import { test } from 'node:test';

const { requiresCurrentSchemaValidation, resolveStrictValidationPolicy } =
  require('../src/server/services/word/WordSavePolicy') as {
    requiresCurrentSchemaValidation: (input: {
      incomingVersion: number;
      hasExistingWord: boolean;
      existingVersion?: number | null;
      source?: 'import';
    }) => boolean;
    resolveStrictValidationPolicy: (input: {
      content: Record<string, unknown>;
      intent?: 'create' | 'update-existing';
      baseWordSchemaVersion?: number | null;
      existingContent?: unknown;
    }) => {
      saveIntent: 'create' | 'update-existing';
      version: number;
      schemaFreshness: 'current' | 'old' | 'future';
      canMaintainNonCurrentWord: boolean;
      notice?: string;
      blockedFutureMessage?: string;
    };
  };

void test('strict validation treats hidden app metadata as current for new editor Words', () => {
  const policy = resolveStrictValidationPolicy({
    content: { yield: { lemma: 'current' } },
    intent: 'create',
  });

  assert.equal(policy.saveIntent, 'create');
  assert.equal(policy.schemaFreshness, 'current');
  assert.equal(policy.canMaintainNonCurrentWord, false);
});

void test('strict validation allows lossless maintenance for an old editor Word session', () => {
  const policy = resolveStrictValidationPolicy({
    content: { yield: { lemma: 'legacy' } },
    intent: 'update-existing',
    baseWordSchemaVersion: 1,
  });

  assert.equal(policy.schemaFreshness, 'old');
  assert.equal(policy.canMaintainNonCurrentWord, true);
  assert.match(policy.notice || '', /old Word structure/);
});

void test('strict validation blocks explicitly future content when not maintaining an existing future Word', () => {
  const policy = resolveStrictValidationPolicy({
    content: {
      ad_fontes: { word_schema_version: 999 },
      yield: { lemma: 'future' },
    },
    intent: 'create',
  });

  assert.equal(policy.schemaFreshness, 'future');
  assert.equal(policy.canMaintainNonCurrentWord, false);
  assert.match(policy.blockedFutureMessage || '', /Update the app/);
});

void test('save preparation requires current schema for manual new Words but not old Word imports', () => {
  assert.equal(
    requiresCurrentSchemaValidation({
      incomingVersion: 1,
      hasExistingWord: false,
    }),
    true
  );
  assert.equal(
    requiresCurrentSchemaValidation({
      incomingVersion: 1,
      hasExistingWord: false,
      source: 'import',
    }),
    false
  );
});
