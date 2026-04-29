const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const apkgServicePath = path.resolve(__dirname, '../services/anki/apkgService.ts');

const { buildApkgBuffer, buildGuidKey, shouldIncludeReverse, toStableIdentifier } = require(
  apkgServicePath
) as {
  buildApkgBuffer: (
    payloads: Array<{
      fields: {
        Word: string;
        Context: string;
        notes: string;
        Back: string;
        'Add Reverse': string;
        Media: string;
      };
      options: { deckName: string; modelName: string; addReverse: boolean; tags: string[] };
      sourceWordId?: string;
      sourceLemma?: string;
    }>
  ) => Promise<Buffer>;
  buildGuidKey: (
    payload: { sourceWordId?: string; sourceLemma?: string; fields: { Word: string } },
    deckName: string
  ) => string;
  shouldIncludeReverse: (payload: { fields: { 'Add Reverse': string } }) => boolean;
  toStableIdentifier: (key: string) => number;
};

const basePayload = {
  fields: {
    Word: 'craft',
    Context: 'She honed her craft.',
    notes: 'n.',
    Back: '<p>Detailed explanation</p>',
    'Add Reverse': 'true',
    Media: '',
  },
  options: {
    deckName: 'English::Words',
    modelName: 'AdFontesWord',
    addReverse: true,
    tags: ['English::type::word'],
  },
  sourceWordId: 'word-1',
  sourceLemma: 'craft',
};

test('toStableIdentifier should be deterministic and positive', () => {
  const id1 = toStableIdentifier('deck:English::Words');
  const id2 = toStableIdentifier('deck:English::Words');
  const id3 = toStableIdentifier('deck:AnotherDeck');

  assert.equal(id1, id2);
  assert.notEqual(id1, id3);
  assert.ok(id1 > 0);
});

test('buildGuidKey should prefer sourceWordId then fallback to sourceLemma and deckName', () => {
  assert.equal(
    buildGuidKey(
      {
        sourceWordId: 'word-123',
        sourceLemma: 'craft',
        fields: { Word: 'craft' },
      },
      'DeckA'
    ),
    'word-123'
  );

  assert.equal(
    buildGuidKey(
      {
        sourceWordId: '',
        sourceLemma: 'craft',
        fields: { Word: 'craft' },
      },
      'DeckA'
    ),
    'craft::DeckA'
  );
});

test('shouldIncludeReverse should honor Add Reverse marker', () => {
  assert.equal(shouldIncludeReverse({ fields: { 'Add Reverse': 'true' } }), true);
  assert.equal(shouldIncludeReverse({ fields: { 'Add Reverse': 'yes' } }), true);
  assert.equal(shouldIncludeReverse({ fields: { 'Add Reverse': '' } }), false);
});

test('buildApkgBuffer should create a zip-like apkg for single and multi payloads', async () => {
  const one = await buildApkgBuffer([basePayload]);
  const two = await buildApkgBuffer([
    basePayload,
    {
      ...basePayload,
      fields: {
        ...basePayload.fields,
        Word: 'forge',
        Context: 'They forge steel.',
      },
      sourceWordId: 'word-2',
      sourceLemma: 'forge',
    },
  ]);

  assert.ok(Buffer.isBuffer(one));
  assert.ok(Buffer.isBuffer(two));
  assert.ok(one.byteLength > 0);
  assert.ok(two.byteLength > one.byteLength);
  assert.equal(one.subarray(0, 2).toString(), 'PK');
  assert.equal(two.subarray(0, 2).toString(), 'PK');
});
