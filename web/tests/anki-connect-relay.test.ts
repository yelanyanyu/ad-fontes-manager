const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const coreRoutePath = path.resolve(__dirname, '../routes/core.ts');
const configModulePath = path.resolve(__dirname, '../utils/config.ts');
const loggerModulePath = path.resolve(__dirname, '../utils/logger.ts');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test_db';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';

function freshRequire(modulePath: string): any {
  delete require.cache[modulePath];
  return require(modulePath);
}

function loadCoreRouterWithLoggerMock(loggerExports: {
  loggers: {
    db: { error: (...args: unknown[]) => void };
    system: { info: (...args: unknown[]) => void };
    anki: {
      info: (...args: unknown[]) => void;
      debug: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    };
  };
  createContextLogger?: (context: Record<string, unknown>) => unknown;
}): any {
  const originalCore = require.cache[coreRoutePath];
  const originalLogger = require.cache[loggerModulePath];

  delete require.cache[coreRoutePath];
  require.cache[loggerModulePath] = {
    id: loggerModulePath,
    filename: loggerModulePath,
    loaded: true,
    exports: loggerExports,
  } as any;

  delete require.cache[configModulePath];
  const router = freshRequire(coreRoutePath);

  delete require.cache[coreRoutePath];
  if (originalCore) {
    require.cache[coreRoutePath] = originalCore;
  }

  if (originalLogger) {
    require.cache[loggerModulePath] = originalLogger;
  } else {
    delete require.cache[loggerModulePath];
  }

  return router;
}

function getRouteHandler(router: any, method: string, routePath: string): any {
  const routeLayer = router.stack.find(
    (layer: any) => layer.route && layer.route.path === routePath && layer.route.methods?.[method]
  );
  assert.ok(routeLayer, `missing route ${method.toUpperCase()} ${routePath}`);
  return routeLayer.route.stack[0].handle;
}

test('POST /anki/connect should relay payload to configured anki endpoint', async () => {
  process.env.ANKI_CONNECT_HOST = '127.0.0.1';
  process.env.ANKI_CONNECT_PORT = '8765';

  const noop = () => {};
  const coreRouter = loadCoreRouterWithLoggerMock({
    createContextLogger: () => ({
      info: noop,
      debug: noop,
      warn: noop,
      error: noop,
    }),
    loggers: {
      db: { error: noop },
      system: { info: noop },
      anki: {
        info: noop,
        debug: noop,
        warn: noop,
        error: noop,
      },
    },
  });
  const handler = getRouteHandler(coreRouter, 'post', '/anki/connect');

  const originalFetch = global.fetch;
  let capturedUrl = '';
  let capturedBody = '';

  global.fetch = (async (url: unknown, init?: any) => {
    capturedUrl = String(url);
    capturedBody = typeof init?.body === 'string' ? init.body : '';
    return {
      status: 200,
      async json() {
        return { result: 6, error: null };
      },
    } as any;
  }) as typeof globalThis.fetch;

  const req = { body: { action: 'version', version: 6 } } as any;
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const originalJson = res.json.bind(res);
      res.json = (payload: unknown) => {
        originalJson(payload);
        resolve();
        return res;
      };

      handler(req, res, (err: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(capturedUrl, 'http://127.0.0.1:8765/');
  assert.equal(capturedBody, JSON.stringify({ action: 'version', version: 6 }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { result: 6, error: null });
});

test('POST /anki/connect should emit info and debug logs with request and response payloads', async () => {
  process.env.ANKI_CONNECT_HOST = '127.0.0.1';
  process.env.ANKI_CONNECT_PORT = '8765';

  const infoCalls: Array<{ payload: unknown; message: string }> = [];
  const debugCalls: Array<{ payload: unknown; message: string }> = [];
  const coreRouter = loadCoreRouterWithLoggerMock({
    createContextLogger: () => ({
      info: (...args: unknown[]) => {
        infoCalls.push({
          payload: args[0],
          message: typeof args[1] === 'string' ? args[1] : '',
        });
      },
      debug: (...args: unknown[]) => {
        debugCalls.push({
          payload: args[0],
          message: typeof args[1] === 'string' ? args[1] : '',
        });
      },
      warn: () => {},
      error: () => {},
    }),
    loggers: {
      db: { error: () => {} },
      system: { info: () => {} },
      anki: {
        info: (...args: unknown[]) => {
          infoCalls.push({
            payload: args[0],
            message: typeof args[1] === 'string' ? args[1] : '',
          });
        },
        debug: (...args: unknown[]) => {
          debugCalls.push({
            payload: args[0],
            message: typeof args[1] === 'string' ? args[1] : '',
          });
        },
        warn: () => {},
        error: () => {},
      },
    },
  });
  const handler = getRouteHandler(coreRouter, 'post', '/anki/connect');

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    return {
      status: 200,
      async json() {
        return { result: 6, error: null };
      },
    } as any;
  }) as typeof globalThis.fetch;

  const req = {
    id: 'req-anki-1',
    method: 'POST',
    originalUrl: '/api/anki/connect',
    body: { action: 'version', version: 6 },
  } as any;
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const originalJson = res.json.bind(res);
      res.json = (payload: unknown) => {
        originalJson(payload);
        resolve();
        return res;
      };

      handler(req, res, (err: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(infoCalls.length, 2);
  assert.deepEqual(infoCalls[0], {
    message: 'Relaying AnkiConnect request',
    payload: {
      requestId: 'req-anki-1',
      method: 'POST',
      route: '/api/anki/connect',
      upstreamUrl: 'http://127.0.0.1:8765/',
      action: 'version',
    },
  });
  assert.deepEqual(debugCalls[0], {
    message: 'AnkiConnect request payload',
    payload: {
      requestId: 'req-anki-1',
      method: 'POST',
      route: '/api/anki/connect',
      upstreamUrl: 'http://127.0.0.1:8765/',
      body: { action: 'version', version: 6 },
    },
  });
  assert.deepEqual(debugCalls[1], {
    message: 'AnkiConnect response payload',
    payload: {
      requestId: 'req-anki-1',
      method: 'POST',
      route: '/api/anki/connect',
      upstreamUrl: 'http://127.0.0.1:8765/',
      statusCode: 200,
      response: { result: 6, error: null },
    },
  });
  assert.deepEqual(infoCalls[1], {
    message: 'AnkiConnect request completed',
    payload: {
      requestId: 'req-anki-1',
      method: 'POST',
      route: '/api/anki/connect',
      upstreamUrl: 'http://127.0.0.1:8765/',
      statusCode: 200,
      success: true,
    },
  });
});
