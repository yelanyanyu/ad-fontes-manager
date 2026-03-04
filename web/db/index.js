const { Pool } = require('pg');
const localStore = require('../localStore');
require('dotenv').config();

// Global Pool Cache
let globalPool = null;
let currentDbUrl = null;

// 连接池安全配置
const POOL_CONFIG = {
    max: 20,                    // 最大连接数
    idleTimeoutMillis: 30000,   // 空闲连接 30 秒超时
    connectionTimeoutMillis: 5000,  // 连接建立 5 秒超时
};

// 生产环境安全检查
const isProduction = () => process.env.NODE_ENV === 'production';

// Helper to get DB client (Runtime reload support with Caching)
const getPool = async (req) => {
    // 1. Determine Target URL
    let targetUrl = null;
    const requestDbUrl = req?.headers?.['x-db-url'];

    // 生产环境：完全禁止 x-db-url 请求头
    if (requestDbUrl) {
        if (isProduction()) {
            console.warn(`[Security] Blocked x-db-url header attempt from ${req.ip} in production`);
            throw new Error('Dynamic database URL not allowed in production');
        }
        // 开发环境：允许但记录日志
        console.log(`[Debug] Using x-db-url header from ${req.ip}`);
        targetUrl = requestDbUrl;
    }

    if (!targetUrl) {
        const config = localStore.getConfig();
        targetUrl = config.DATABASE_URL || process.env.DATABASE_URL;

        if (!targetUrl && process.env.DB_HOST) {
            const user = process.env.DB_USER || 'postgres';
            const pass = process.env.DB_PASS || 'postgres';
            const host = process.env.DB_HOST || 'localhost';
            const port = config.DB_PORT || process.env.DB_PORT;
            const db = process.env.DB_NAME || 'etymos';
            targetUrl = port
                ? `postgresql://${user}:${pass}@${host}:${port}/${db}`
                : `postgresql://${user}:${pass}@${host}/${db}`;
        }
    }

    if (!targetUrl) {
        throw new Error('No database URL configured');
    }

    // 2. Check Cache
    // 如果请求使用 x-db-url 头（仅开发环境），创建临时连接池（不缓存）
    if (requestDbUrl && !isProduction()) {
        return new Pool({
            connectionString: targetUrl,
            ...POOL_CONFIG
        });
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
    globalPool = new Pool({
        connectionString: targetUrl,
        ...POOL_CONFIG
    });
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
