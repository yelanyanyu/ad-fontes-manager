const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
// Load .env from parent directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL is not set in ../.env');
  console.error('   Please copy .env.example to .env and configure your database connection.');
  process.exit(1);
}

// Parse URL to get connection details for maintenance DB
const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!match) {
  console.error('❌ Invalid DATABASE_URL format');
  console.error('   Expected format: postgresql://user:password@host:port/dbname');
  process.exit(1);
}

const [_, user, password, host, port, dbName] = match;

async function init() {
  console.log('🔧 Ad Fontes Manager - Database Initialization');
  console.log('='.repeat(50));
  console.log(`📁 Database: ${dbName}`);
  console.log(`🌐 Host: ${host}:${port}`);
  console.log(`👤 User: ${user}`);
  console.log('');

  // 1. Connect to 'postgres' to check/create DB
  const maintenanceClient = new Client({
    user,
    password,
    host,
    port,
    database: 'postgres', // Maintenance DB
  });

  try {
    await maintenanceClient.connect();
    console.log('✅ Connected to PostgreSQL maintenance database');

    const res = await maintenanceClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [
      dbName,
    ]);
    if (res.rows.length === 0) {
      console.log(`🆕 Database '${dbName}' does not exist. Creating...`);
      await maintenanceClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database '${dbName}' created successfully.`);
    } else {
      console.log(`ℹ️  Database '${dbName}' already exists.`);
    }
  } catch (e) {
    console.error('❌ Error checking/creating database:', e.message);
    if (e.code === 'ECONNREFUSED') {
      console.error('   Make sure PostgreSQL is running and accessible.');
    }
    process.exit(1);
  } finally {
    await maintenanceClient.end();
  }

  console.log('');

  // 2. Connect to target DB and run schema
  console.log(`🔨 Applying schema to '${dbName}'...`);
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('✅ Connected to target database');

    // Check if pgcrypto extension is available
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      console.log('✅ pgcrypto extension ready');
    } catch (e) {
      console.warn('⚠️  Could not create pgcrypto extension:', e.message);
    }

    const schemaPath = path.join(__dirname, '../schema.sql');

    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await client.query(schemaSql);
    console.log('✅ Schema applied successfully.');

    // Check tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('');
    console.log('📊 Tables in database:');
    tables.forEach(table => {
      console.log(`   • ${table}`);
    });

    console.log('');
    console.log('='.repeat(50));
    console.log('🎉 Database initialization completed!');
    console.log('');
    console.log('Next steps:');
    console.log('   1. cd web && npm run dev');
    console.log('   2. Open http://localhost:5173 in your browser');
    console.log('');
  } catch (e) {
    console.error('❌ Error applying schema:', e.message);
    if (e.code === '42P01') {
      console.error('   Table does not exist. Schema may be incomplete.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

init();
