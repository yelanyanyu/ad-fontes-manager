import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import electronPackage from 'electron/package.json' with { type: 'json' };
import { checkFileLocked, killProcesses } from './native-lock.mjs';

const rootDir = process.cwd();
const command = process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild';
const executable = path.join(rootDir, 'node_modules', '.bin', command);
const nativeFilePath = path.join(
  rootDir,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

// Check for locked file and auto-kill any processes holding it.
const lock = checkFileLocked(nativeFilePath);

if (lock.locked && lock.processes.length > 0) {
  const pids = lock.processes.map(p => p.pid);
  console.error(
    `better-sqlite3 rebuild blocked: ${lock.processes.length} process(es) holding the file.`
  );
  for (const proc of lock.processes) {
    console.error(`  - PID ${proc.pid}: ${proc.name}${proc.path ? ` (${proc.path})` : ''}`);
  }
  console.error('Auto-killing them so the rebuild can proceed...');
  const killed = killProcesses(pids);
  console.error(`Killed ${killed} / ${pids.length} process(es).`);
  console.error('');
} else if (lock.locked) {
  console.error(
    `Warning: ${nativeFilePath} is locked but no owning process found (${lock.reason}).`
  );
  console.error('Attempting rebuild anyway...');
  console.error('');
}

console.error(`Rebuilding better-sqlite3 for Electron ${electronPackage.version}...`);

const result = spawnSync(
  executable,
  [
    '--version',
    electronPackage.version,
    '--which-module',
    'better-sqlite3',
    '--force',
    '--build-from-source',
  ],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Clear the Node ABI marker so ensure-node-native knows a rebuild is needed.
const nodeAbiMarker = path.join(
  rootDir,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  '.node-abi'
);
try {
  fs.unlinkSync(nodeAbiMarker);
} catch {
  // File may not exist — that's fine.
}
