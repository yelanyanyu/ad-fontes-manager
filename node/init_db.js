const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
// Load .env from parent directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('DATABASE_URL is not set in ../.env');
    process.exit(1);
}

// Parse URL to get connection details for maintenance DB
const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!match) {
    console.error('Invalid DATABASE_URL format');
    process.exit(1);
}

const [_, user, password, host, port, dbName] = match;

async function init() {
    console.log(`Checking database: ${dbName}...`);
    console.log(`Using URL: postgresql://${user}:****@${host}:${port}/${dbName}`);

    // 1. Connect to 'postgres' to check/create DB
    const maintenanceClient = new Client({
        user,
        password,
        host,
        port,
        database: 'postgres' // Maintenance DB
    });

    try {
        await maintenanceClient.connect();
        
        const res = await maintenanceClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
        if (res.rows.length === 0) {
            console.log(`Database '${dbName}' does not exist. Creating...`);
            await maintenanceClient.query(`CREATE DATABASE "${dbName}"`);
            console.log(`Database '${dbName}' created.`);
        } else {
            console.log(`Database '${dbName}' already exists.`);
        }
    } catch (e) {
        console.error('Error checking/creating database:', e);
        process.exit(1);
    } finally {
        await maintenanceClient.end();
    }

    // 2. Connect to target DB and run schema
    console.log(`Applying schema to '${dbName}'...`);
    const client = new Client({ connectionString: dbUrl });
    
    try {
        await client.connect();
        const schemaPath = path.join(__dirname, '../schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        await client.query(schemaSql);
        console.log('Schema applied successfully.');
        
        // Check tables
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables in DB:', tablesRes.rows.map(r => r.table_name).join(', '));
        
    } catch (e) {
        console.error('Error applying schema:', e);
    } finally {
        await client.end();
    }
}

init();
