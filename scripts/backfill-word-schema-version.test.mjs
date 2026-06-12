import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { backfillWordSchemaVersionRows } from './backfill-word-schema-version.mjs';

void describe('backfillWordSchemaVersionRows', () => {
  void it('adds v1 metadata to Words missing a Word Schema Version', () => {
    const result = backfillWordSchemaVersionRows([
      {
        id: 'missing',
        content: JSON.stringify({ yield: { lemma: 'missing' } }),
        word_schema_version: 7,
      },
    ]);
    const [update] = result.updates;
    const content = JSON.parse(update.content);

    assert.equal(result.scanned, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.alreadyVersioned, 0);
    assert.equal(result.skippedInvalidJson, 0);
    assert.equal(result.dryRun, false);
    assert.equal(update.id, 'missing');
    assert.equal(content.ad_fontes.word_schema_version, 1);
    assert.equal(update.word_schema_version, 1);
  });

  void it('preserves existing metadata and synchronizes the derived column', () => {
    const result = backfillWordSchemaVersionRows([
      {
        id: 'current',
        content: JSON.stringify({
          ad_fontes: { word_schema_version: 2, note: 'keep' },
          yield: { lemma: 'current' },
        }),
        word_schema_version: 1,
      },
    ]);
    const [update] = result.updates;
    const content = JSON.parse(update.content);

    assert.equal(result.scanned, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.alreadyVersioned, 1);
    assert.equal(content.ad_fontes.word_schema_version, 2);
    assert.equal(content.ad_fontes.note, 'keep');
    assert.equal(update.word_schema_version, 2);
  });

  void it('skips invalid JSON content and reports it', () => {
    const result = backfillWordSchemaVersionRows([
      {
        id: 'bad',
        content: '{not-json',
        word_schema_version: 1,
      },
    ]);

    assert.equal(result.scanned, 1);
    assert.equal(result.updated, 0);
    assert.equal(result.skippedInvalidJson, 1);
    assert.deepEqual(result.updates, []);
  });

  void it('reports dry run updates without changing the generated update contract', () => {
    const result = backfillWordSchemaVersionRows(
      [
        {
          id: 'missing',
          content: JSON.stringify({ yield: { lemma: 'missing' } }),
          word_schema_version: 7,
        },
      ],
      { dryRun: true }
    );

    assert.equal(result.dryRun, true);
    assert.equal(result.updated, 1);
    assert.equal(result.updates.length, 1);
  });
});
