const { Pool } = require('pg');
const config = require('../utils/config');

// Global Pool Cache
let globalPool = null;
let currentDbUrl = null;

// 连接池安全配置
const getPoolConfig = () => {
  const poolSize = config.get('database.pool_size');
  return {
    max: poolSize || (config.get('core.env') === 'production' ? 20 : 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
};

/**
 * 获取数据库连接池
 * 后端直接从统一配置读取数据库连接信息
 */
const getPool = async () => {
  // 从统一配置获取数据库 URL
  const targetUrl = config.get('database.url');

  if (!targetUrl) {
    throw new Error(
      'No database URL configured. Please set database.url in config.yml or AD_FONTES_DATABASE_URL environment variable.'
    );
  }

  // 检查缓存
  if (globalPool && currentDbUrl === targetUrl) {
    return globalPool;
  }

  // 重新创建连接池
  if (globalPool) {
    await globalPool.end();
  }

  console.log('Initializing new DB Pool...');
  const poolConfig = getPoolConfig();

  globalPool = new Pool({
    connectionString: targetUrl,
    ...poolConfig,
    ssl: config.get('database.ssl') ? { rejectUnauthorized: false } : false,
  });

  currentDbUrl = targetUrl;

  // 添加错误处理器
  globalPool.on('error', err => {
    console.error('Unexpected error on idle client', err);
  });

  return globalPool;
};

/**
 * 强制重置连接池（配置变更后使用）
 */
const resetPool = async () => {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
    currentDbUrl = null;
  }
};

module.exports = { getPool, resetPool };
