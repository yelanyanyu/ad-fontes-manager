import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();

if (canLoadBetterSqlite3()) {
  console.log('better-sqlite3 is ready for the current Node runtime.');
  process.exit(0);
}

console.log('Rebuilding better-sqlite3 for the current Node runtime...');
run('npm', ['rebuild', 'better-sqlite3']);

if (!canLoadBetterSqlite3()) {
  console.error('better-sqlite3 still cannot be loaded after npm rebuild.');
  process.exit(1);
}

console.log('better-sqlite3 rebuilt for the current Node runtime.');

function canLoadBetterSqlite3() {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();",
    ],
    {
      cwd: rootDir,
      stdio: 'ignore',
    }
  );
  return result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
