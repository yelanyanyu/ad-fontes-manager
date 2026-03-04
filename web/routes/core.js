const express = require('express');
const router = express.Router();
const localStore = require('../localStore');
const { getPool, resetPool } = require('../db');
const { asyncHandler, Unauthorized, ServiceUnavailable } = require('../utils/errors');
const { loggers } = require('../utils/logger');

// 管理员 Token 验证中间件
const requireAdminAuth = (req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminToken = process.env.ADMIN_TOKEN;
  const requestToken = req.headers['x-admin-token'];

  // 生产环境：必须设置 ADMIN_TOKEN 且验证通过
  if (isProduction) {
    if (!adminToken) {
      loggers.auth.error('[Security] ADMIN_TOKEN not configured in production');
      throw ServiceUnavailable('Service unavailable: admin authentication not configured');
    }

    if (requestToken !== adminToken) {
      loggers.auth.warn(`[Security] Unauthorized config access attempt from ${req.ip}`);
      throw Unauthorized('Unauthorized: invalid admin token');
    }
  }
  // 开发环境：可选验证，如果设置了 ADMIN_TOKEN 则验证
  else if (adminToken && requestToken !== adminToken) {
    loggers.auth.warn(`[Security] Unauthorized config access attempt from ${req.ip} (dev mode)`);
    throw Unauthorized('Unauthorized: invalid admin token');
  }

  next();
};

// 数据库状态检查 - 后端直接检查，不依赖前端传递连接信息
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    try {
      const pool = await getPool();
      await pool.query('SELECT 1');
      res.json({ connected: true });
    } catch (e) {
      loggers.db.error('Database status check failed:', e.message);
      res.json({ connected: false, error: e.message });
    }
  })
);

// 更新配置 - 仅管理员可访问
router.post(
  '/config',
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const { database_url, MAX_LOCAL_ITEMS } = req.body;
    localStore.saveConfig({
      DATABASE_URL: database_url,
      MAX_LOCAL_ITEMS: MAX_LOCAL_ITEMS,
    });

    // 强制重置连接池
    await resetPool();
    loggers.system.info('Database configuration updated');

    res.json({ success: true });
  })
);

// 获取配置
router.get(
  '/config',
  asyncHandler(async (req, res) => {
    const config = localStore.getConfig();
    // 不返回敏感信息如完整数据库连接字符串
    const safeConfig = {
      MAX_LOCAL_ITEMS: config.MAX_LOCAL_ITEMS,
      API_PORT: config.API_PORT,
      CLIENT_DEV_PORT: config.CLIENT_DEV_PORT,
      // 只返回数据库连接状态，不返回连接字符串
      hasDatabaseUrl: !!(config.DATABASE_URL || process.env.DATABASE_URL),
    };
    res.json(safeConfig);
  })
);

// 检查单词
const wordController = require('../controllers/wordController');
router.get('/check', (req, res) => wordController.check(req, res));

// 健康检查
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  })
);

module.exports = router;
