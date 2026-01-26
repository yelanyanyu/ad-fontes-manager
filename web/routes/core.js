const express = require('express');
const router = express.Router();
const localStore = require('../localStore');
const { getPool, resetPool } = require('../db');

// Config & Status
router.get('/status', async (req, res) => {
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
        if(isTemp && pool) await pool.end();
    }
});

router.post('/config', async (req, res) => {
    const { database_url, MAX_LOCAL_ITEMS } = req.body;
    localStore.saveConfig({ 
        DATABASE_URL: database_url,
        MAX_LOCAL_ITEMS: MAX_LOCAL_ITEMS 
    });
    
    // Force reset pool on next request
    await resetPool();
    
    res.json({ success: true });
});

router.get('/config', (req, res) => {
    try {
        const config = localStore.getConfig();
        res.json(config);
    } catch (e) {
        console.error('Error in /api/config:', e);
        res.status(500).json({ error: 'Failed to load config' });
    }
});

// Check Word (Public helper)
const wordController = require('../controllers/wordController');
router.get('/check', (req, res) => wordController.check(req, res));

// Health (Legacy)
router.get('/health', async (req, res) => {
    try {
        const pool = await getPool(req);
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
