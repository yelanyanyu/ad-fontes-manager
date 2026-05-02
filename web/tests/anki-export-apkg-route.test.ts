const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');
const configModulePath = path.resolve(__dirname, '../utils/config.ts');
const apkgServicePath = path.resolve(__dirname, '../services/anki/apkgService.ts');
const dbModulePath = path.resolve(__dirname, '../db/index.ts');
const fieldExtractorPath = path.resolve(__dirname, '../services/anki/fieldExtractor.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

type BuildApkgInput = {
  payloads: unknown[];
  modelFields: string[];
  selectedTemplate: { name: string; front: string; back: string };
  css: string;
};

function loadCoreRouterWithApkgMock(
  apkgService: {
    buildApkgBuffer: (input: BuildApkgInput) => Promise<Buffer>;
    normalizeApkgFileName: (value: string) => string;
  },
  extraMocks?: {
    db?: unknown;
    fieldExtractor?: unknown;
  }
): any {
  const originalCore = require.cache[coreRoutePath];
  const originalApkgService = require.cache[apkgServicePath];
  const originalDb = require.cache[dbModulePath];
  const originalFieldExtractor = require.cache[fieldExtractorPath];

  delete require.cache[coreRoutePath];
  require.cache[apkgServicePath] = {
    id: apkgServicePath,
    filename: apkgServicePath,
    loaded: true,
    exports: apkgService,
  } as NodeModule;

  if (extraMocks?.db) {
    require.cache[dbModulePath] = {
      id: dbModulePath,
      filename: dbModulePath,
      loaded: true,
      exports: extraMocks.db,
    } as NodeModule;
  }

  if (extraMocks?.fieldExtractor) {
    require.cache[fieldExtractorPath] = {
      id: fieldExtractorPath,
      filename: fieldExtractorPath,
      loaded: true,
      exports: extraMocks.fieldExtractor,
    } as NodeModule;
  }

  delete require.cache[configModulePath];
  const router = freshRequire(coreRoutePath);

  delete require.cache[coreRoutePath];
  if (originalCore) {
    require.cache[coreRoutePath] = originalCore;
  }

  if (originalApkgService) {
    require.cache[apkgServicePath] = originalApkgService;
  } else {
    delete require.cache[apkgServicePath];
  }

  if (originalDb) {
    require.cache[dbModulePath] = originalDb;
  } else {
    delete require.cache[dbModulePath];
  }

  if (originalFieldExtractor) {
    require.cache[fieldExtractorPath] = originalFieldExtractor;
  } else {
    delete require.cache[fieldExtractorPath];
  }

  return router;
}

function getRouteLayer(router: any, method: string, routePath: string): any {
  const routeLayer = router.stack.find(
    (layer: any) => layer.route && layer.route.path === routePath && layer.route.methods?.[method]
  );
  assert.ok(routeLayer, `missing route ${method.toUpperCase()} ${routePath}`);
  return routeLayer;
}

async function invokeRouteStack(
  routeLayer: any,
  body: unknown
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  payload: unknown;
  error: unknown;
}> {
  const req = { body } as any;
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    payload: null as unknown,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    locals: {},
  } as any;

  let index = 0;
  let capturedError: unknown = null;

  const runNext = async (err?: unknown): Promise<void> => {
    if (err) {
      capturedError = err;
      return;
    }

    const layer = routeLayer.route.stack[index++];
    if (!layer) return;

    await new Promise<void>(resolve => {
      try {
        const maybePromise = layer.handle(req, res, (nextErr?: unknown) => {
          if (nextErr) {
            capturedError = nextErr;
            resolve();
            return;
          }
          resolve();
        });

        Promise.resolve(maybePromise)
          .then(() => resolve())
          .catch(nextErr => {
            capturedError = nextErr;
            resolve();
          });
      } catch (nextErr) {
        capturedError = nextErr;
        resolve();
      }
    });

    if (!capturedError) {
      await runNext();
    }
  };

  await runNext();

  return {
    statusCode: res.statusCode,
    headers,
    payload: res.payload,
    error: capturedError,
  };
}

const validPayload = {
  fields: {
    Word: 'craft',
    Context: 'She honed her craft.',
    notes: '',
    Back: '<p>detail</p>',
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

const selectedTemplate = {
  name: 'Forward',
  front: '{{Word}}',
  back: '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}',
};

const validBody = {
  fileName: 'test.apkg',
  payloads: [validPayload],
  modelFields: ['Word', 'Context', 'notes', 'Back', 'Media'],
  selectedTemplate,
  css: '.card { font-family: serif; }',
};

test('POST /anki/export-apkg should reject empty payloads', async () => {
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async () => Buffer.from('PK\x05\x06'),
    normalizeApkgFileName: (value: string) => value,
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const result = await invokeRouteStack(layer, {
    ...validBody,
    payloads: [],
  });

  assert.equal((result.error as any)?.statusCode, 400);
});

test('POST /anki/export-apkg should reject missing css with a specific message', async () => {
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async () => Buffer.from('PK\x05\x06'),
    normalizeApkgFileName: (value: string) => value,
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const { css: _css, ...bodyWithoutCss } = validBody;
  const result = await invokeRouteStack(layer, bodyWithoutCss);

  assert.equal((result.error as any)?.statusCode, 400);
  assert.match((result.error as any)?.message, /css/);
});

test('POST /anki/export-apkg should reject mixed deck names', async () => {
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async () => Buffer.from('PK\x05\x06'),
    normalizeApkgFileName: (value: string) => value,
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const result = await invokeRouteStack(layer, {
    ...validBody,
    payloads: [
      validPayload,
      {
        ...validPayload,
        options: {
          ...validPayload.options,
          deckName: 'AnotherDeck',
        },
      },
    ],
  });

  assert.equal((result.error as any)?.statusCode, 400);
});

test('POST /anki/export-apkg should reject mixed model names', async () => {
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async () => Buffer.from('PK\x05\x06'),
    normalizeApkgFileName: (value: string) => value,
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const result = await invokeRouteStack(layer, {
    ...validBody,
    payloads: [
      validPayload,
      {
        ...validPayload,
        options: {
          ...validPayload.options,
          modelName: 'AnotherModel',
        },
      },
    ],
  });

  assert.equal((result.error as any)?.statusCode, 400);
});

test('POST /anki/export-apkg should pass css to the APKG builder and return binary', async () => {
  let capturedInput: BuildApkgInput | null = null;
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async (input: BuildApkgInput) => {
      capturedInput = input;
      return Buffer.from('PK\x03\x04fake-apkg');
    },
    normalizeApkgFileName: (value: string) => value.trim() || 'ad-fontes-export.apkg',
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const result = await invokeRouteStack(layer, {
    ...validBody,
    fileName: '  english_words.apkg  ',
  });

  assert.equal(result.error, null);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Content-Type'], 'application/octet-stream');
  assert.equal(result.headers['Content-Disposition'], 'attachment; filename="english_words.apkg"');
  assert.ok(Buffer.isBuffer(result.payload));
  assert.equal((result.payload as Buffer).subarray(0, 2).toString(), 'PK');
  const input = capturedInput as BuildApkgInput | null;
  if (!input) {
    throw new Error('Expected APKG builder input to be captured');
  }
  assert.equal(input.css, validBody.css);
});

test('POST /anki/export-apkg-by-ids should build APKG payloads from SQLite word content', async () => {
  let capturedInput: BuildApkgInput | null = null;
  let capturedIds: unknown[] | null = null;
  const router = loadCoreRouterWithApkgMock(
    {
      buildApkgBuffer: async (input: BuildApkgInput) => {
        capturedInput = input;
        return Buffer.from('PK\x03\x04fake-apkg');
      },
      normalizeApkgFileName: (value: string) => value.trim() || 'ad-fontes-export.apkg',
    },
    {
      db: {
        getSqlite: () => ({
          prepare: (sql: string) => {
            assert.match(sql, /FROM words_v2/);
            return {
              all: (...ids: unknown[]) => {
                capturedIds = ids;
                return [
                  {
                    id: 'word-1',
                    lemma: 'craft',
                    content: JSON.stringify({
                      yield: {
                        lemma: 'craft',
                        user_context_sentence: 'She honed her craft.',
                      },
                    }),
                  },
                  {
                    id: 'word-2',
                    lemma: 'forge',
                    content: {
                      yield: {
                        lemma: 'forge',
                        user_context_sentence: 'They forge steel.',
                      },
                    },
                  },
                ];
              },
            };
          },
        }),
        closeDb: () => undefined,
      },
      fieldExtractor: {
        buildAnkiFields: (content: Record<string, unknown>) => ({
          Word: String((content.yield as Record<string, unknown>).lemma),
          Back: '<p>rendered</p>',
        }),
      },
    }
  );
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg-by-ids');

  const result = await invokeRouteStack(layer, {
    fileName: '  all_words.apkg  ',
    wordIds: ['word-1', 'word-2'],
    fieldMapping: [
      { source: 'lemma', target: 'Word' },
      { source: 'rendered_html', target: 'Back' },
    ],
    options: validPayload.options,
    modelFields: ['Word', 'Back'],
    selectedTemplate,
    css: '.card { color: #222; }',
  });

  assert.equal(result.error, null);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Content-Disposition'], 'attachment; filename="all_words.apkg"');
  assert.deepEqual(capturedIds, ['word-1', 'word-2']);
  const input = capturedInput as BuildApkgInput | null;
  if (!input) {
    throw new Error('Expected APKG builder input to be captured');
  }
  assert.equal(input.css, '.card { color: #222; }');
  assert.deepEqual(input.payloads, [
    {
      fields: { Word: 'craft', Back: '<p>rendered</p>' },
      options: validPayload.options,
      sourceWordId: 'word-1',
      sourceLemma: 'craft',
    },
    {
      fields: { Word: 'forge', Back: '<p>rendered</p>' },
      options: validPayload.options,
      sourceWordId: 'word-2',
      sourceLemma: 'forge',
    },
  ]);
});
