const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schemaPath = path.resolve(__dirname, '../../schema.sql');
const migrationUpPath = path.resolve(
  __dirname,
  '../../migrations/20260306_phase0_rls_lockdown.up.sql'
);
const migrationDownPath = path.resolve(
  __dirname,
  '../../migrations/20260306_phase0_rls_lockdown.down.sql'
);

test('schema.sql removes public write policy and keeps controlled write policy', () => {
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  assert.equal(schemaContent.includes('CREATE POLICY "Allow public write access"'), false);
  assert.equal(schemaContent.includes('CREATE POLICY "Allow service write access"'), true);
});

test('phase0 RLS migration includes both up and down scripts', () => {
  assert.equal(fs.existsSync(migrationUpPath), true, 'missing migration up script');
  assert.equal(fs.existsSync(migrationDownPath), true, 'missing migration down script');
});

test('phase0 RLS migration up drops public write and creates service write policy', () => {
  const migrationUpContent = fs.readFileSync(migrationUpPath, 'utf8');

  assert.equal(
    migrationUpContent.includes('DROP POLICY IF EXISTS "Allow public write access" ON words'),
    true
  );
  assert.equal(
    migrationUpContent.includes('CREATE POLICY "Allow service write access" ON words'),
    true
  );
});

test('phase0 RLS migration down restores public write policy', () => {
  const migrationDownContent = fs.readFileSync(migrationDownPath, 'utf8');

  assert.equal(
    migrationDownContent.includes('CREATE POLICY "Allow public write access" ON words'),
    true
  );
});

