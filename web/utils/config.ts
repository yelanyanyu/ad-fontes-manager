const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');

type Primitive = string | number | boolean | null;
type ConfigValue = Primitive | ConfigObject | ConfigValue[];
interface ConfigObject {
  [key: string]: ConfigValue | undefined;
}

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      console.error('❌ 生产环境禁止存在 .env 文件');
      console.error(`   发现文件: ${envPath}`);
      console.error('   请使用系统环境变量或 Docker env_file 注入配置');
      process.exit(1);
    }
  }
}

if (!isProduction) {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      (require('dotenv') as typeof import('dotenv')).config({ path: envPath });
      break;
    }
  }
}

const defaultConfig: ConfigObject = {
  core: {
    env: 'development',
    admin_token: 'dev-token-not-for-production',
  },
  server: {
    port: 8080,
    host: '127.0.0.1',
    cors_origins: ['*'],
    rate_limit: 0,
    timeout_ms: 10000,
  },
  database: {
    url: null,
    ssl: false,
    pool_size: null,
  },
  client: {
    dev_port: 5173,
  },
  storage: {
    max_items: 100,
  },
  logging: {
    level: 'info',
    dir: './logs',
    rotation: {
      interval: '1d',
      max_size: '10M',
      max_files: 30,
    },
    audit: true,
  },
  features: {
    local_draft: true,
    sync: true,
    conflict_detection: true,
  },
  security: {
    helmet: true,
    hsts: true,
    min_password_length: 8,
  },
};

const envMapping: Record<string, string> = {
  NODE_ENV: 'core.env',
  ADMIN_TOKEN: 'core.admin_token',
  PORT: 'server.port',
  SERVER_PORT: 'server.port',
  SERVER_HOST: 'server.host',
  SERVER_CORS_ORIGINS: 'server.cors_origins',
  SERVER_RATE_LIMIT: 'server.rate_limit',
  SERVER_TIMEOUT_MS: 'server.timeout_ms',
  DATABASE_URL: 'database.url',
  DATABASE_SSL: 'database.ssl',
  DATABASE_POOL_SIZE: 'database.pool_size',
  CLIENT_DEV_PORT: 'client.dev_port',
  MAX_LOCAL_ITEMS: 'storage.max_items',
  LOG_LEVEL: 'logging.level',
  LOG_DIR: 'logging.dir',
  LOG_AUDIT: 'logging.audit',
};

function parseEnvValue(value: string | undefined): ConfigValue | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value) as ConfigValue;
    } catch {
      return value;
    }
  }
  return value;
}

function loadFromEnv(): ConfigObject {
  const envConfig: ConfigObject = {};

  for (const [envName, configPath] of Object.entries(envMapping)) {
    const envValue = process.env[envName];
    if (envValue === undefined) continue;

    const keys = configPath.split('.');
    let current: ConfigObject = envConfig;

    for (let i = 0; i < keys.length - 1; i += 1) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key] as ConfigObject;
    }

    current[keys[keys.length - 1]] = parseEnvValue(envValue);
  }

  return envConfig;
}

function deepMerge(target: ConfigObject, source: ConfigObject): ConfigObject {
  const result: ConfigObject = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];
    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      sourceValue !== undefined
    ) {
      const merged = deepMerge(
        (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
          ? (targetValue as ConfigObject)
          : {}) as ConfigObject,
        sourceValue as ConfigObject
      );
      result[key] = merged;
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }

  return result;
}

function getByPath(config: ConfigObject, lookupPath: string): ConfigValue | undefined {
  const keys = lookupPath.split('.');
  let current: ConfigValue | undefined = config;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as ConfigObject)[key];
  }
  return current;
}

function validateConfig(config: ConfigObject): void {
  const required = [
    { path: 'database.url', env: 'DATABASE_URL' },
    { path: 'core.admin_token', env: 'ADMIN_TOKEN' },
    { path: 'core.env', env: 'NODE_ENV' },
  ];

  const missing: string[] = [];
  for (const item of required) {
    if (!getByPath(config, item.path)) {
      missing.push(item.env);
    }
  }

  if (missing.length > 0) {
    console.error('❌ 缺少必需的环境变量:');
    missing.forEach(env => console.error(`   - ${env}`));
    process.exit(1);
  }

  if (getByPath(config, 'core.env') === 'production') {
    const adminToken = String(getByPath(config, 'core.admin_token') ?? '');
    if (adminToken.length < 32) {
      console.error('❌ 生产环境 ADMIN_TOKEN 必须至少 32 字符');
      process.exit(1);
    }
    if (!getByPath(config, 'database.ssl')) {
      console.warn('⚠️  警告: 生产环境建议启用数据库 SSL (DATABASE_SSL=true)');
    }
  }
}

let configCache: ConfigObject | null = null;

function loadConfig(): ConfigObject {
  if (configCache) return configCache;
  const envConfig = loadFromEnv();
  configCache = deepMerge(defaultConfig, envConfig);
  validateConfig(configCache);
  return configCache;
}

function get<T = unknown>(lookupPath: string, defaultValue?: T): T {
  const config = loadConfig();
  const value = getByPath(config, lookupPath);
  if (value === undefined) return defaultValue as T;
  return value as T;
}

function getAll(): ConfigObject {
  return loadConfig();
}

function clearCache(): void {
  configCache = null;
}

function reload(): ConfigObject {
  clearCache();
  return loadConfig();
}

loadConfig();

module.exports = {
  get,
  getAll,
  reload,
  clearCache,
  defaultConfig,
};
