import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import electronPackage from 'electron/package.json' with { type: 'json' };

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

assertNativeFileIsUnlocked(nativeFilePath);

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

function assertNativeFileIsUnlocked(filePath) {
  if (!fs.existsSync(filePath)) return;

  if (process.platform === 'win32') {
    const lockingProcesses = findWindowsProcessesLoadingModule(filePath);
    if (lockingProcesses.length > 0) {
      printLockedFileMessage(filePath, lockingProcesses);
      process.exit(1);
    }
  }

  const probePath = `${filePath}.rebuild-lock-check-${process.pid}`;

  try {
    fs.renameSync(filePath, probePath);
    fs.renameSync(probePath, filePath);
  } catch (error) {
    if (fs.existsSync(probePath) && !fs.existsSync(filePath)) {
      fs.renameSync(probePath, filePath);
    }

    const code = error && typeof error === 'object' ? error.code : '';
    if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
      printLockedFileMessage(filePath, []);
      process.exit(1);
    }

    throw error;
  }
}

function findWindowsProcessesLoadingModule(filePath) {
  const escapedPath = filePath.replaceAll("'", "''");
  const powershell = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );
  const command = `
$target = '${escapedPath}';
Get-Process | ForEach-Object {
  $process = $_;
  try {
    $process.Modules | Where-Object { $_.FileName -eq $target } | ForEach-Object {
      [pscustomobject]@{
        Id = $process.Id;
        ProcessName = $process.ProcessName;
        Path = $process.Path
      }
    }
  } catch {}
} | ConvertTo-Json -Compress
`;
  const result = spawnSync(powershell, ['-NoProfile', '-Command', command], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0 || !result.stdout.trim()) return [];

  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function printLockedFileMessage(filePath, lockingProcesses) {
  console.error('');
  console.error('Cannot rebuild better-sqlite3 because the native .node file is locked.');
  console.error(`Locked file: ${filePath}`);

  if (lockingProcesses.length > 0) {
    console.error('');
    console.error('Processes currently loading this file:');
    for (const processInfo of lockingProcesses) {
      console.error(
        `- PID ${processInfo.Id}: ${processInfo.ProcessName}${processInfo.Path ? ` (${processInfo.Path})` : ''}`
      );
    }
  }

  console.error('');
  console.error('Close any running development servers or desktop app instances, then retry:');
  console.error('- npm run dev:web');
  console.error('- npm run dev:server');
  console.error('- npm run dev:desktop');
  console.error('- Ad Fontes Manager.exe / Electron preview windows');
  console.error('');
}
