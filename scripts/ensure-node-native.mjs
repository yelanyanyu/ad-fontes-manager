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

// 当前 Node ABI 会写进标记文件，下一次启动时可以少做一次重建。
const nodeAbi = process.versions.modules;
const markerFile = path.join(
  rootDir,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  '.node-abi'
);

// 标记和当前 ABI 一致时，先尝试直接加载；能加载就不再重建。
if (readMarker() === nodeAbi && fs.existsSync(nativeFilePath)) {
  if (canLoadBetterSqlite3()) {
    console.log('better-sqlite3 is ready for the current Node runtime.');
    process.exit(0);
  }
  // 标记存在但模块加载失败，通常说明本地文件损坏或被别的构建覆盖。
  console.log('better-sqlite3 marker matches but module fails to load. Rebuilding...');
}

// 需要切回 Node ABI 时，先处理可能占用 .node 文件的残留进程。
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
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['rebuild', 'better-sqlite3']);

// 清掉 Electron ABI 标记，下一次桌面运行前会重新构建 Electron 版本。
try {
  fs.unlinkSync(forgeMetaPath);
} catch {
  // 文件可能本来就不存在，这里不需要中断恢复流程。
}

if (!canLoadBetterSqlite3()) {
  console.error('better-sqlite3 still cannot be loaded after pnpm rebuild.');
  console.error('Try closing all Node.js / Electron processes and running:');
  console.error('  pnpm run rebuild:node:native');
  process.exit(1);
}

// 写入 Node ABI 标记，后续 Web/dev 入口可以快速判断是否需要重建。
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
    // 标记写入失败不影响当前运行，只是下次会重新检查。
  }
}
