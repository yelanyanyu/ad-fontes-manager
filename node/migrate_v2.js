const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('DATABASE_URL is not set in ../.env');
    process.exit(1);
}

async function migrate() {
    console.log('Starting migration v2...');
    const client = new Client({ connectionString: dbUrl });
    
    try {
        await client.connect();
        const sql = fs.readFileSync(path.join(__dirname, '../migration_v2.sql'), 'utf8');
        await client.query(sql);
        console.log('Migration v2 completed successfully.');
    } catch (e) {
        console.error('Migration failed:', e.message);
        if (e.code === '23505') {
            console.error('Error: Duplicate lemmas found. Please clean up database manually before migrating.');
        }
    } finally {
        await client.end();
    }
}

migrate();
