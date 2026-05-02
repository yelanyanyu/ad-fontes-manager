const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const apkgServicePath = path.resolve(__dirname, '../services/anki/apkgService.ts');

const { buildApkgBuffer, buildGuidKey, toStableIdentifier } = require(apkgServicePath) as {
  buildApkgBuffer: (input: {
    payloads: Array<{
      fields: {
        Word: string;
        Context: string;
        notes: string;
        Back: string;
        Media: string;
      };
      options: { deckName: string; modelName: string; tags: string[] };
      sourceWordId?: string;
      sourceLemma?: string;
    }>;
    modelFields: string[];
    selectedTemplate: { name: string; front: string; back: string };
    css: string;
  }) => Promise<Buffer>;
  buildGuidKey: (
    payload: { sourceWordId?: string; sourceLemma?: string; fields: { Word: string } },
    deckName: string
  ) => string;
  toStableIdentifier: (key: string) => number;
};

const basePayload = {
  fields: {
    Word: 'craft',
    Context: 'She honed her craft.',
    notes: 'n.',
    Back: '<p>Detailed explanation</p>',
    Media: '',
  },
  options: {
    deckName: 'English::Words',
    modelName: 'AdFontesWord',
    tags: ['English::type::word'],
  },
  sourceWordId: 'word-1',
  sourceLemma: 'craft',
};

const buildInput = {
  payloads: [basePayload],
  modelFields: ['Word', 'Context', 'notes', 'Back', 'Media'],
  selectedTemplate: {
    name: 'Forward',
    front: '{{Word}}',
    back: '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}',
  },
  css: '.card { font-family: serif; }',
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

test('buildApkgBuffer should create a zip-like apkg for single and multi payloads', async () => {
  const one = await buildApkgBuffer(buildInput);
  const two = await buildApkgBuffer({
    ...buildInput,
    payloads: [
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
    ],
  });

  assert.ok(Buffer.isBuffer(one));
  assert.ok(Buffer.isBuffer(two));
  assert.ok(one.byteLength > 0);
  assert.ok(two.byteLength > one.byteLength);
  assert.equal(one.subarray(0, 2).toString(), 'PK');
  assert.equal(two.subarray(0, 2).toString(), 'PK');
});
