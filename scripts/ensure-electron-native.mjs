import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
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

// Check current ABI from .forge-meta.
// Format: "x64--140" or "x64--127" (arch--abi)
let currentAbi = '';
try {
  currentAbi = fs.readFileSync(forgeMetaPath, 'utf8').trim();
} catch {
  // File doesn't exist — module hasn't been built for Electron yet.
}

if (currentAbi && currentAbi.endsWith('--140')) {
  console.log('better-sqlite3 is ready for Electron (ABI 140).');
  process.exit(0);
}

// Module needs rebuild for Electron ABI.
// Check if the file is locked by lingering processes.
if (fs.existsSync(nativeFilePath)) {
  const lock = checkFileLocked(nativeFilePath);
  if (lock.locked && lock.processes.length > 0) {
    console.error('');
    console.error('better-sqlite3 needs a rebuild for Electron but the .node file is locked by:');
    for (const proc of lock.processes) {
      console.error(`  - PID ${proc.pid}: ${proc.name}${proc.path ? ` (${proc.path})` : ''}`);
    }
    console.error('');
    console.error('Auto-killing these processes so the rebuild can proceed...');
    const killed = killProcesses(lock.processes.map(p => p.pid));
    console.error(`Killed ${killed} / ${lock.processes.length} process(es).`);
    console.error('');
  }
}

// Run the full Electron rebuild.
const rebuildScript = path.join(rootDir, 'scripts', 'rebuild-electron-native.mjs');
const result = spawnSync(process.execPath, [rebuildScript], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
