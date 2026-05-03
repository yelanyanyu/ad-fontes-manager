import path from 'node:path';
import { spawnSync } from 'node:child_process';
import electronPackage from 'electron/package.json' with { type: 'json' };

const command = process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild';
const executable = path.join(process.cwd(), 'node_modules', '.bin', command);

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
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
