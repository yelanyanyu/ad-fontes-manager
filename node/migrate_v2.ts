const { Client } = require('pg') as {
  Client: new (config: { connectionString?: string }) => {
    connect: () => Promise<void>;
    query: (sql: string, params?: unknown[]) => Promise<DbQueryResult>;
    end: () => Promise<void>;
  };
};

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

type DbQueryResult = import('./utils/db-config').DbQueryResult;

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is not set in ../.env');
  process.exit(1);
}

async function migrate(): Promise<void> {
  console.log('Starting migration v2...');
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, '../migration_v2.sql'), 'utf8');
    await client.query(sql);
    console.log('Migration v2 completed successfully.');
  } catch (error) {
    const err = error as { message?: string; code?: string };
    console.error('Migration failed:', err.message);
    if (err.code === '23505') {
      console.error('Error: Duplicate lemmas found. Please clean up database manually before migrating.');
    }
  } finally {
    await client.end();
  }
}

void migrate();
