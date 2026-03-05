const { Pool } = require('pg') as {
  Pool: new (config: Record<string, unknown>) => {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    end: () => Promise<void>;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  };
};

const config = require('../utils/config') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
};

type PoolLike = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  end: () => Promise<void>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

let globalPool: PoolLike | null = null;
let currentDbUrl: string | null = null;

const getPoolConfig = (): Record<string, unknown> => {
  const poolSize = config.get<number | null>('database.pool_size');
  return {
    max: poolSize || (config.get<string>('core.env') === 'production' ? 20 : 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
};

const getPool = async (): Promise<PoolLike> => {
  const targetUrl = config.get<string | null>('database.url');

  if (!targetUrl) {
    throw new Error(
      'No database URL configured. Please set database.url in config.yml or AD_FONTES_DATABASE_URL environment variable.'
    );
  }

  if (globalPool && currentDbUrl === targetUrl) {
    return globalPool;
  }

  if (globalPool) {
    await globalPool.end();
  }

  console.log('Initializing new DB Pool...');
  const poolConfig = getPoolConfig();

  globalPool = new Pool({
    connectionString: targetUrl,
    ...poolConfig,
    ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
  }) as unknown as PoolLike;

  currentDbUrl = targetUrl;

  globalPool.on('error', err => {
    console.error('Unexpected error on idle client', err);
  });

  return globalPool;
};

const resetPool = async (): Promise<void> => {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
    currentDbUrl = null;
  }
};

module.exports = { getPool, resetPool };
