const express = require('express');
const router = express.Router();
const localStore = require('../localStore');
const { getPool, resetPool } = require('../db');
const { asyncHandler, Unauthorized, ServiceUnavailable } = require('../utils/errors');

// 管理员 Token 验证中间件
const requireAdminAuth = (req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const adminToken = process.env.ADMIN_TOKEN;
  const requestToken = req.headers['x-admin-token'];

  // 生产环境：必须设置 ADMIN_TOKEN 且验证通过
  if (isProduction) {
    if (!adminToken) {
      console.error('[Security] ADMIN_TOKEN not configured in production');
      throw ServiceUnavailable('Service unavailable: admin authentication not configured');
    }

    if (requestToken !== adminToken) {
      console.warn(`[Security] Unauthorized config access attempt from ${req.ip}`);
      throw Unauthorized('Unauthorized: invalid admin token');
    }
  }
  // 开发环境：可选验证，如果设置了 ADMIN_TOKEN 则验证
  else if (adminToken && requestToken !== adminToken) {
    console.warn(`[Security] Unauthorized config access attempt from ${req.ip} (dev mode)`);
    throw Unauthorized('Unauthorized: invalid admin token');
  }

  next();
};

// Config & Status
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    let pool;
    let isTemp = false;
    try {
      if (req.headers['x-db-url']) {
        const { Pool } = require('pg');
        pool = new Pool({ connectionString: req.headers['x-db-url'] });
        isTemp = true;
      } else {
        pool = await getPool(req);
      }

      await pool.query('SELECT 1');
      res.json({ connected: true });
    } catch (e) {
      console.error('Status Check Failed:', e.message);
      res.json({ connected: false, error: e.message });
    } finally {
      if (isTemp && pool) await pool.end();
    }
  })
);

router.post(
  '/config',
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const { database_url, MAX_LOCAL_ITEMS } = req.body;
    localStore.saveConfig({
      DATABASE_URL: database_url,
      MAX_LOCAL_ITEMS: MAX_LOCAL_ITEMS,
    });

    // Force reset pool on next request
    await resetPool();

    res.json({ success: true });
  })
);

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    const config = localStore.getConfig();
    res.json(config);
  })
);

// Check Word (Public helper)
const wordController = require('../controllers/wordController');
router.get('/check', (req, res) => wordController.check(req, res));

// Health (Legacy)
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  })
);

module.exports = router;
