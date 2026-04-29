const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');
const configModulePath = path.resolve(__dirname, '../utils/config.ts');
const apkgServicePath = path.resolve(__dirname, '../services/anki/apkgService.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

function loadCoreRouterWithApkgMock(apkgService: {
  buildApkgBuffer: (payloads: unknown[]) => Promise<Buffer>;
  normalizeApkgFileName: (value: string) => string;
}): any {
  const originalCore = require.cache[coreRoutePath];
  const originalApkgService = require.cache[apkgServicePath];

  delete require.cache[coreRoutePath];
  require.cache[apkgServicePath] = {
    id: apkgServicePath,
    filename: apkgServicePath,
    loaded: true,
    exports: apkgService,
  } as NodeModule;

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

test('POST /anki/export-apkg should reject empty payloads', async () => {
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async () => Buffer.from('PK\x05\x06'),
    normalizeApkgFileName: (value: string) => value,
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const result = await invokeRouteStack(layer, {
    fileName: 'test.apkg',
    payloads: [],
  });

  assert.equal((result.error as any)?.statusCode, 400);
});

test('POST /anki/export-apkg should reject mixed deck names', async () => {
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async () => Buffer.from('PK\x05\x06'),
    normalizeApkgFileName: (value: string) => value,
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const result = await invokeRouteStack(layer, {
    fileName: 'test.apkg',
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
    fileName: 'test.apkg',
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

test('POST /anki/export-apkg should return binary apkg with download headers', async () => {
  const router = loadCoreRouterWithApkgMock({
    buildApkgBuffer: async () => Buffer.from('PK\x03\x04fake-apkg'),
    normalizeApkgFileName: (value: string) => value.trim() || 'ad-fontes-export.apkg',
  });
  const layer = getRouteLayer(router, 'post', '/anki/export-apkg');

  const result = await invokeRouteStack(layer, {
    fileName: '  english_words.apkg  ',
    payloads: [validPayload],
  });

  assert.equal(result.error, null);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Content-Type'], 'application/octet-stream');
  assert.equal(result.headers['Content-Disposition'], 'attachment; filename="english_words.apkg"');
  assert.ok(Buffer.isBuffer(result.payload));
  assert.equal((result.payload as Buffer).subarray(0, 2).toString(), 'PK');
});
