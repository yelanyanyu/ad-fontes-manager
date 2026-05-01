/**
 * DEPRECATED: PG v2 migration. The old PostgreSQL schema has been replaced by SQLite + Drizzle.
 * This file is kept for historical reference only.
 * Use "npx tsx init_db.ts" for SQLite initialization.
 */
console.error(
  'migrate_v2 is deprecated. PostgreSQL is no longer used.\n' +
    'Use: npx tsx init_db.ts    (initialize SQLite database)\n' +
    '     npx tsx loader.ts <file>  (import YAML to words_v2)'
);
process.exit(1);
