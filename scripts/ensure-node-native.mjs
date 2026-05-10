import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { checkFileLocked, killProcesses } from './native-lock.mjs';

const rootDir = process.cwd();
const nativeFilePath = path.join(
  rootDir,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);
const forgeMetaPath = path.join(
  rootDir,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  '.forge-meta'
);

// Current Node ABI version — used as a marker so we don't rebuild unnecessarily.
const nodeAbi = process.versions.modules;
const markerFile = path.join(
  rootDir,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  '.node-abi'
);

// If the marker matches the current Node ABI, the module should be ready.
if (readMarker() === nodeAbi && fs.existsSync(nativeFilePath)) {
  // Quick sanity check that the module actually loads.
  if (canLoadBetterSqlite3()) {
    console.log('better-sqlite3 is ready for the current Node runtime.');
    process.exit(0);
  }
  // Module doesn't load despite matching marker — possibly corrupted. Rebuild.
  console.log('better-sqlite3 marker matches but module fails to load. Rebuilding...');
}

// Module needs a rebuild for Node ABI.
// Check if the file is locked by lingering processes.
if (fs.existsSync(nativeFilePath)) {
  const lock = checkFileLocked(nativeFilePath);
  if (lock.locked && lock.processes.length > 0) {
    console.error('');
    console.error('better-sqlite3 needs a rebuild but the .node file is locked by:');
    for (const proc of lock.processes) {
      console.error(`  - PID ${proc.pid}: ${proc.name}${proc.path ? ` (${proc.path})` : ''}`);
    }
    console.error('');
    console.error('Auto-killing these processes so the rebuild can proceed...');
    const killed = killProcesses(lock.processes.map(p => p.pid));
    console.error(`Killed ${killed} / ${lock.processes.length} process(es).`);
    console.error('');
  } else if (lock.locked) {
    console.error(
      `Warning: ${nativeFilePath} is locked but no owning process found (${lock.reason}).`
    );
  }
}

console.log('Rebuilding better-sqlite3 for the current Node runtime...');
run('npm', ['rebuild', 'better-sqlite3']);

// Clear Electron forge-meta so ensure-electron-native knows a rebuild is needed.
try {
  fs.unlinkSync(forgeMetaPath);
} catch {
  // File may not exist — that's fine.
}

if (!canLoadBetterSqlite3()) {
  console.error('better-sqlite3 still cannot be loaded after npm rebuild.');
  console.error('Try closing all Node.js / Electron processes and running:');
  console.error('  npm run rebuild:node:native');
  process.exit(1);
}

// Write marker so future runs skip the rebuild.
writeMarker(nodeAbi);
console.log('better-sqlite3 rebuilt for the current Node runtime.');

// ---- helpers ----

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
      timeout: 10000,
    }
  );
  return result.status === 0;
}

function run(command, args) {
  const status = runAllowFailure(command, args);
  if (status !== 0) {
    process.exit(status);
  }
}

function runAllowFailure(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status ?? 1;
}

function readMarker() {
  try {
    return fs.readFileSync(markerFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function writeMarker(abi) {
  try {
    fs.mkdirSync(path.dirname(markerFile), { recursive: true });
    fs.writeFileSync(markerFile, `${abi}\n`);
  } catch {
    // Non-critical — just means we'll recheck next time.
  }
}
