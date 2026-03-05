const { Client } = require('pg') as {
  Client: new (config: {
    user?: string;
    password?: string;
    host?: string;
    port?: string;
    database?: string;
    connectionString?: string;
  }) => {
    connect: () => Promise<void>;
    query: (sql: string, params?: unknown[]) => Promise<BaseDbQueryResult>;
    end: () => Promise<void>;
  };
};

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const dbConfig = require('./utils/db-config') as typeof import('./utils/db-config');

type BaseDbQueryResult = import('./utils/db-config').DbQueryResult;
type DbQueryResult<T extends Record<string, unknown> = Record<string, unknown>> =
  import('./utils/db-config').DbQueryResult<T>;

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is not set in ../.env');
  console.error('Please copy .env.example to .env and configure your database connection.');
  process.exit(1);
}

const parsedUrl = dbConfig.parseDatabaseUrl(dbUrl);
if (!parsedUrl) {
  console.error('Invalid DATABASE_URL format');
  console.error('Expected format: postgresql://user:password@host:port/dbname');
  process.exit(1);
}

const { user, password, host, port, database: dbName } = parsedUrl;

async function init(): Promise<void> {
  console.log('Ad Fontes Manager - Database Initialization');
  console.log('='.repeat(50));
  console.log(`Database: ${dbName}`);
  console.log(`Host: ${host}:${port}`);
  console.log(`User: ${user}`);
  console.log('');

  const maintenanceClient = new Client({
    user,
    password,
    host,
    port,
    database: 'postgres',
  });

  try {
    await maintenanceClient.connect();
    console.log('Connected to PostgreSQL maintenance database');

    const res = await maintenanceClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [
      dbName,
    ]);
    if (res.rows.length === 0) {
      console.log(`Database '${dbName}' does not exist. Creating...`);
      await maintenanceClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database '${dbName}' created successfully.`);
    } else {
      console.log(`Database '${dbName}' already exists.`);
    }
  } catch (error) {
    const err = error as { message?: string; code?: string };
    console.error('Error checking/creating database:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('Make sure PostgreSQL is running and accessible.');
    }
    process.exit(1);
  } finally {
    await maintenanceClient.end();
  }

  console.log('');

  console.log(`Applying schema to '${dbName}'...`);
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('Connected to target database');

    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      console.log('pgcrypto extension ready');
    } catch (error) {
      const err = error as { message?: string };
      console.warn('Could not create pgcrypto extension:', err.message);
    }

    const schemaPath = path.join(__dirname, '../schema.sql');

    if (!fs.existsSync(schemaPath)) {
      console.error(`Schema file not found: ${schemaPath}`);
      process.exit(1);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('Schema applied successfully.');

    const tablesRes = (await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)) as DbQueryResult<{ table_name: string }>;

    const tables = tablesRes.rows.map((row: { table_name: string }) => row.table_name);
    console.log('');
    console.log('Tables in database:');
    tables.forEach((table: string) => {
      console.log(`  - ${table}`);
    });

    console.log('');
    console.log('='.repeat(50));
    console.log('Database initialization completed!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. cd web && npm run dev');
    console.log('  2. Open http://localhost:5173 in your browser');
    console.log('');
  } catch (error) {
    const err = error as { message?: string; code?: string };
    console.error('Error applying schema:', err.message);
    if (err.code === '42P01') {
      console.error('Table does not exist. Schema may be incomplete.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

void init();
