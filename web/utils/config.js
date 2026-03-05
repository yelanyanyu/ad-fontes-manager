/**
 * ============================================================================
 * Config - 12-Factor 配置管理模块
 * ============================================================================
 *
 * 【功能简介】
 * 本模块遵循 12-Factor App 原则，仅通过环境变量管理配置。
 * 开发环境自动加载 .env 文件，生产环境禁止 .env 文件。
 *
 * 【配置加载优先级】
 * 1. 系统环境变量 (最高优先级)
 * 2. .env 文件 (仅开发环境)
 * 3. 代码默认值 (最低优先级)
 *
 * 【必需配置项】
 * - DATABASE_URL: PostgreSQL 连接字符串
 * - ADMIN_TOKEN: 管理员 API 令牌
 * - NODE_ENV: 运行环境 (development/production/test)
 *
 * 【使用方式】
 * const config = require('./utils/config');
 *
 * // 获取配置值
 * const dbUrl = config.get('database.url');
 * const port = config.get('server.port', 8080);
 *
 * // 获取完整配置
 * const allConfig = config.getAll();
 * ============================================================================
 */

const path = require('path');
const fs = require('fs');

// 检测运行环境
const isProduction = process.env.NODE_ENV === 'production';

// 生产环境：禁止 .env 文件存在
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

// 开发环境：加载 .env 文件
if (!isProduction) {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
      break;
    }
  }
}

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

// 环境变量映射表
const envMapping = {
  // 核心配置
  NODE_ENV: 'core.env',
  ADMIN_TOKEN: 'core.admin_token',

  // 服务器配置
  PORT: 'server.port',
  SERVER_PORT: 'server.port',
  SERVER_HOST: 'server.host',
  SERVER_CORS_ORIGINS: 'server.cors_origins',
  SERVER_RATE_LIMIT: 'server.rate_limit',
  SERVER_TIMEOUT_MS: 'server.timeout_ms',

  // 数据库配置
  DATABASE_URL: 'database.url',
  DATABASE_SSL: 'database.ssl',
  DATABASE_POOL_SIZE: 'database.pool_size',

  // 前端配置
  CLIENT_DEV_PORT: 'client.dev_port',

  // 存储配置
  MAX_LOCAL_ITEMS: 'storage.max_items',

  // 日志配置
  LOG_LEVEL: 'logging.level',
  LOG_DIR: 'logging.dir',
  LOG_AUDIT: 'logging.audit',
};

/**
 * 解析环境变量值
 * @param {string} value - 环境变量值
 * @returns {*} 解析后的值
 */
function parseEnvValue(value) {
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

      current[keys[keys.length - 1]] = parseEnvValue(envValue);
    }
  }

  return envConfig;
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
 * 验证必需配置项
 * @param {Object} config - 配置对象
 * @throws {Error} 如果缺少必需配置项
 */
function validateConfig(config) {
  const required = [
    { path: 'database.url', env: 'DATABASE_URL' },
    { path: 'core.admin_token', env: 'ADMIN_TOKEN' },
    { path: 'core.env', env: 'NODE_ENV' },
  ];

  const missing = [];

  for (const item of required) {
    const keys = item.path.split('.');
    let current = config;
    for (const key of keys) {
      current = current?.[key];
    }
    if (!current) {
      missing.push(item.env);
    }
  }

  if (missing.length > 0) {
    console.error('❌ 缺少必需的环境变量:');
    missing.forEach(env => console.error(`   - ${env}`));
    console.error('\n请通过以下方式设置:');
    console.error('   1. 创建 .env 文件（开发环境）');
    console.error('   2. 设置系统环境变量');
    console.error('   3. 使用 Docker env_file（生产环境）');
    process.exit(1);
  }

  // 生产环境额外验证
  if (config.core.env === 'production') {
    // ADMIN_TOKEN 长度验证
    if (config.core.admin_token.length < 32) {
      console.error('❌ 生产环境 ADMIN_TOKEN 必须至少 32 字符');
      console.error(`   当前长度: ${config.core.admin_token.length}`);
      console.error('   生成命令: openssl rand -hex 32');
      process.exit(1);
    }

    // SSL 验证
    if (!config.database.ssl) {
      console.warn('⚠️  警告: 生产环境建议启用数据库 SSL (DATABASE_SSL=true)');
    }
  }
}

// 配置缓存
let configCache = null;

/**
 * 加载配置（带缓存和验证）
 * @returns {Object} 完整配置对象
 */
function loadConfig() {
  if (configCache) {
    return configCache;
  }

  const envConfig = loadFromEnv();
  configCache = deepMerge(defaultConfig, envConfig);

  // 验证配置
  validateConfig(configCache);

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

// 立即加载并验证配置（应用启动时）
loadConfig();

module.exports = {
  get,
  getAll,
  reload,
  clearCache,
  defaultConfig,
};
