/**
 * ============================================================================
 * Config - 统一配置管理模块
 * ============================================================================
 *
 * 【功能简介】
 * 本模块提供统一的配置管理功能，支持从 YAML 配置文件和环境变量加载配置。
 * 实现配置加载优先级：环境变量 > config.yml > 代码默认值
 *
 * 【使用方式】
 * const config = require('./utils/config');
 *
 * // 获取配置值
 * const dbUrl = config.get('database.url');
 * const port = config.get('server.port');
 *
 * // 获取带默认值的配置
 * const timeout = config.get('server.timeout_ms', 10000);
 *
 * 【配置加载优先级】
 * 1. 环境变量 (AD_FONTES_DATABASE_URL)
 * 2. config.yml 文件
 * 3. 代码中的安全默认值
 *
 * 【环境变量映射】
 * AD_FONTES_CORE_ENV -> core.env
 * AD_FONTES_DATABASE_URL -> database.url
 * AD_FONTES_SERVER_PORT -> server.port
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// 配置缓存
let configCache = null;

// 默认配置
const defaultConfig = {
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

/**
 * 环境变量映射表
 * 将环境变量名映射到配置路径
 */
const envMapping = {
  // 核心配置
  AD_FONTES_CORE_ENV: 'core.env',
  AD_FONTES_ADMIN_TOKEN: 'core.admin_token',
  NODE_ENV: 'core.env',
  ADMIN_TOKEN: 'core.admin_token',

  // 服务器配置
  AD_FONTES_SERVER_PORT: 'server.port',
  AD_FONTES_SERVER_HOST: 'server.host',
  AD_FONTES_SERVER_CORS_ORIGINS: 'server.cors_origins',
  AD_FONTES_SERVER_RATE_LIMIT: 'server.rate_limit',
  AD_FONTES_SERVER_TIMEOUT_MS: 'server.timeout_ms',
  PORT: 'server.port',
  SERVER_PORT: 'server.port',
  SERVER_HOST: 'server.host',

  // 数据库配置
  AD_FONTES_DATABASE_URL: 'database.url',
  AD_FONTES_DATABASE_SSL: 'database.ssl',
  AD_FONTES_DATABASE_POOL_SIZE: 'database.pool_size',
  DATABASE_URL: 'database.url',
  DATABASE_SSL: 'database.ssl',

  // 前端配置
  AD_FONTES_CLIENT_DEV_PORT: 'client.dev_port',
  CLIENT_DEV_PORT: 'client.dev_port',

  // 存储配置
  AD_FONTES_STORAGE_MAX_ITEMS: 'storage.max_items',
  MAX_LOCAL_ITEMS: 'storage.max_items',

  // 日志配置
  AD_FONTES_LOG_LEVEL: 'logging.level',
  AD_FONTES_LOG_DIR: 'logging.dir',
  AD_FONTES_LOG_AUDIT: 'logging.audit',
  LOG_LEVEL: 'logging.level',
  LOG_DIR: 'logging.dir',
};

/**
 * 解析环境变量值
 * @param {string} value - 环境变量值
 * @param {string} _path - 配置路径
 * @returns {*} 解析后的值
 */
function parseEnvValue(value, _path) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  // 布尔值解析
  if (value === 'true') return true;
  if (value === 'false') return false;

  // 数字解析
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  // JSON 数组解析
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

/**
 * 从环境变量加载配置
 * @returns {Object} 环境变量配置
 */
function loadFromEnv() {
  const envConfig = {};

  for (const [envName, configPath] of Object.entries(envMapping)) {
    const envValue = process.env[envName];
    if (envValue !== undefined) {
      const keys = configPath.split('.');
      let current = envConfig;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = parseEnvValue(envValue, configPath);
    }
  }

  return envConfig;
}

/**
 * 从 YAML 文件加载配置
 * @returns {Object} YAML 配置
 */
function loadFromYaml() {
  const configPaths = [
    path.join(process.cwd(), 'config.yml'),
    path.join(process.cwd(), '..', 'config.yml'),
    path.join(__dirname, '..', '..', 'config.yml'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        return yaml.load(content) || {};
      } catch (e) {
        console.warn(`Warning: Failed to load config from ${configPath}:`, e.message);
      }
    }
  }

  return {};
}

/**
 * 深度合并对象
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * 加载配置（带缓存）
 * @returns {Object} 完整配置对象
 */
function loadConfig() {
  if (configCache) {
    return configCache;
  }

  // 按优先级合并配置
  const yamlConfig = loadFromYaml();
  const envConfig = loadFromEnv();

  configCache = deepMerge(deepMerge(defaultConfig, yamlConfig), envConfig);

  return configCache;
}

/**
 * 获取配置值
 * @param {string} path - 配置路径，如 'database.url'
 * @param {*} defaultValue - 默认值
 * @returns {*} 配置值
 */
function get(path, defaultValue) {
  const config = loadConfig();
  const keys = path.split('.');
  let current = config;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current !== undefined ? current : defaultValue;
}

/**
 * 获取完整配置对象
 * @returns {Object} 完整配置
 */
function getAll() {
  return loadConfig();
}

/**
 * 清除配置缓存（用于测试或热重载）
 */
function clearCache() {
  configCache = null;
}

/**
 * 重新加载配置
 * @returns {Object} 重新加载后的配置
 */
function reload() {
  clearCache();
  return loadConfig();
}

module.exports = {
  get,
  getAll,
  reload,
  clearCache,
  defaultConfig,
};
