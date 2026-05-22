const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const { ConfigSchema } = require('../schemas/config') as {
  ConfigSchema: {
    safeParse: (value: unknown) => {
      success: boolean;
      data: unknown;
      error: {
        issues: Array<{ path: Array<string | number>; message: string }>;
      };
    };
  };
};
const { getDefaultAppConfig } = require('./defaultAppConfig') as {
  getDefaultAppConfig: () => ConfigObject;
};
const { migrateUserConfig } = require('./configMigration') as {
  migrateUserConfig: (input: ConfigObject) => { config: ConfigObject; changed: boolean };
};

type Primitive = string | number | boolean | null;
type ConfigValue = Primitive | ConfigObject | ConfigValue[];
interface ConfigObject {
  [key: string]: ConfigValue | undefined;
}

interface AIConfigShape extends ConfigObject {
  queue_concurrency?: number;
  providers?: Array<{
    id: string;
    name?: string;
    type?: string;
    baseUrl?: string;
    anthropicBaseUrl?: string;
    apiKey?: string;
    models?: Array<{ id: string; name?: string; endpointType?: string }>;
  }>;
  search?: {
    provider?: string;
    apiKey?: string;
    domains?: Record<string, string[]>;
  };
  stages?: Record<
    string,
    { provider?: string; model?: string; reasoningEffort?: string } | undefined
  >;
  review?: {
    threshold?: number;
    thresholdByLanguage?: Record<string, number>;
  };
}

const isDesktop = process.env.ADFONTES_DESKTOP === '1';
const isProduction = process.env.NODE_ENV === 'production' && !isDesktop;

if (isProduction) {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      console.error('鉂?鐢熶骇鐜绂佹瀛樺湪 .env 鏂囦欢');
      console.error(`   鍙戠幇鏂囦欢: ${envPath}`);
      console.error('   璇蜂娇鐢ㄧ郴缁熺幆澧冨彉閲忔垨 Docker env_file 娉ㄥ叆閰嶇疆');
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

const defaultConfig: ConfigObject = getDefaultAppConfig();

function resolveConfigPath(): string {
  if (process.env.ADFONTES_CONFIG_PATH) return process.env.ADFONTES_CONFIG_PATH;
  return path.join(process.cwd(), 'config.json');
}

function loadConfigFile(): ConfigObject {
  const configPath = resolveConfigPath();
  try {
    if (!fs.existsSync(configPath)) return {};

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const migration = migrateUserConfig(parsed as ConfigObject);
      if (migration.changed) {
        fs.writeFileSync(configPath, JSON.stringify(migration.config, null, 2), 'utf-8');
      }
      return migration.config;
    }
    console.warn(`config.json at ${configPath} is not a valid object, ignoring`);
  } catch (error) {
    console.warn(`Failed to read ${configPath}, using defaults`, error);
  }
  return {};
}

function backupConfigFile(configPath: string): void {
  if (!fs.existsSync(configPath)) return;
  try {
    fs.copyFileSync(configPath, `${configPath}.bak`);
  } catch {
    // A failed backup should not block saving the current config.
  }
}

function saveConfigFile(config: ConfigObject): void {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${configPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  backupConfigFile(configPath);
  fs.renameSync(tmpPath, configPath);
  clearCache();
}

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
  ANKI_CONNECT_HOST: 'anki.host',
  ANKI_CONNECT_PORT: 'anki.port',
  MAX_LOCAL_ITEMS: 'storage.max_items',
  LOG_LEVEL: 'logging.level',
  LOG_DIR: 'logging.dir',
  LOG_ROTATION_INTERVAL: 'logging.rotation.interval',
  LOG_ROTATION_MAX_SIZE: 'logging.rotation.max_size',
  LOG_ROTATION_MAX_FILES: 'logging.rotation.max_files',
  SECURITY_HELMET: 'security.helmet',
  SECURITY_HSTS: 'security.hsts',
  AI_SEARCH_API_KEY: 'ai.search.apiKey',
  AI_SEARCH_PROVIDER: 'ai.search.provider',
  AI_QUEUE_CONCURRENCY: 'ai.queue_concurrency',
  AI_REVIEW_THRESHOLD: 'ai.review.threshold',
  AI_FAST_PROVIDER: 'ai.stages.fast.provider',
  AI_FAST_MODEL: 'ai.stages.fast.model',
  AI_FAST_REASONING_EFFORT: 'ai.stages.fast.reasoningEffort',
  AI_BALANCED_PROVIDER: 'ai.stages.balanced.provider',
  AI_BALANCED_MODEL: 'ai.stages.balanced.model',
  AI_BALANCED_REASONING_EFFORT: 'ai.stages.balanced.reasoningEffort',
  AI_EXPERT_PROVIDER: 'ai.stages.expert.provider',
  AI_EXPERT_MODEL: 'ai.stages.expert.model',
  AI_EXPERT_REASONING_EFFORT: 'ai.stages.expert.reasoningEffort',
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
    if (isDesktop && envName === 'NODE_ENV') continue;

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

function validateConfig(config: ConfigObject): ConfigObject {
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    console.error('鉂?閰嶇疆鏍￠獙澶辫触:');
    result.error.issues.forEach(issue => {
      const issuePath = issue.path.length > 0 ? issue.path.join('.') : 'root';
      console.error(`   - ${issuePath}: ${issue.message}`);
    });
    process.exit(1);
  }

  const validatedConfig = result.data as ConfigObject;
  if (
    getByPath(validatedConfig, 'core.env') === 'production' &&
    !getByPath(validatedConfig, 'database.ssl')
  ) {
    console.warn('鈿狅笍  璀﹀憡: 鐢熶骇鐜寤鸿鍚敤鏁版嵁搴?SSL (DATABASE_SSL=true)');
  }

  return validatedConfig;
}

let configCache: ConfigObject | null = null;

function loadConfig(): ConfigObject {
  if (configCache) return configCache;
  const fileConfig = loadConfigFile();
  const envConfig = loadFromEnv();
  configCache = validateConfig(deepMerge(defaultConfig, deepMerge(fileConfig, envConfig)));
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

function getAIConfig(): AIConfigShape | undefined {
  return get<AIConfigShape | undefined>('ai', undefined);
}

function getAPIKeyMasked(config: AIConfigShape): AIConfigShape {
  return {
    ...config,
    providers:
      config.providers?.map(provider => ({
        ...provider,
        apiKey: provider.apiKey ? `sk-***${provider.apiKey.slice(-4)}` : '',
      })) || [],
    search: config.search
      ? {
          ...config.search,
          apiKey: config.search.apiKey ? `***${config.search.apiKey.slice(-4)}` : '',
        }
      : undefined,
  };
}

loadConfig();

module.exports = {
  get,
  getAll,
  getAIConfig,
  getAPIKeyMasked,
  reload,
  clearCache,
  defaultConfig,
  loadConfigFile,
  saveConfigFile,
  resolveConfigPath,
};
