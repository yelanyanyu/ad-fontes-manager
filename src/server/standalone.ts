import path from 'node:path';
import { createApp } from './app';

const config = require('./utils/config') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

const { loggers } = require('./utils/logger') as {
  loggers: {
    system: {
      info: (payload: Record<string, unknown>) => void;
    };
  };
};

const isProduction = config.get<string>('core.env', 'development') === 'production';
const dbPath = config.get<string>('database.url', './web/data/ad_fontes.db');
const distDir = path.resolve(__dirname, '..', '..', 'dist');

const app = createApp({
  dbPath,
  isProduction,
  distDir,
  redirectToClient: !isProduction,
});

const apiPort = config.get<number>('server.port', 8080);
const serverHost = config.get<string>('server.host', '127.0.0.1');
const requestTimeoutMs = Number(config.get<number>('server.timeout_ms', 10000));

const server = app.listen(apiPort, serverHost, () => {
  loggers.system.info({
    msg: `Server running on http://${serverHost}:${apiPort}`,
    port: apiPort,
    host: serverHost,
    env: config.get<string>('core.env'),
    logLevel: config.get<string>('logging.level'),
  });
});

if (Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0) {
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.max(requestTimeoutMs + 1000, 60_000);
}
