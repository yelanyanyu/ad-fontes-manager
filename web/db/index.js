const { Pool } = require('pg');
const localStore = require('../localStore');
require('dotenv').config();

// Global Pool Cache
let globalPool = null;
let currentDbUrl = null;

// Helper to get DB client (Runtime reload support with Caching)
const getPool = async (req) => {
    // 1. Determine Target URL
    let targetUrl = req?.headers?.['x-db-url'];
    
    if (!targetUrl) {
        const config = localStore.getConfig();
        targetUrl = config.DATABASE_URL || process.env.DATABASE_URL;
    }

    if (!targetUrl) {
        throw new Error('No database URL configured');
    }

    // 2. Check Cache
    // If request has specific header, create a temporary pool (for testing connection)
    if (req?.headers?.['x-db-url']) {
        return new Pool({ connectionString: targetUrl });
    }

    // Main Pool Logic
    if (globalPool && currentDbUrl === targetUrl) {
        return globalPool;
    }

    // Re-create Pool
    if (globalPool) {
        await globalPool.end(); // Close old
    }

    console.log('Initializing new DB Pool...');
    globalPool = new Pool({ connectionString: targetUrl });
    currentDbUrl = targetUrl;
    
    // Add error handler to prevent crash on idle client error
    globalPool.on('error', (err, client) => {
        console.error('Unexpected error on idle client', err);
    });

    return globalPool;
};

// Force reset logic (e.g., after config change)
const resetPool = async () => {
    if (globalPool) {
        await globalPool.end();
        globalPool = null;
        currentDbUrl = null;
    }
};

module.exports = { getPool, resetPool };
