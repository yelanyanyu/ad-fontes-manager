import { spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';

const target = process.argv[2];
const supportedTargets = new Set(['win', 'mac']);

class CommandError extends Error {
  constructor(status) {
    super(`Command failed with status ${status}`);
    this.status = status;
  }
}

if (!supportedTargets.has(target)) {
  console.error('Usage: node scripts/build-desktop.mjs <win|mac>');
  process.exit(1);
}

let buildStatus = 0;
let restoreStatus = 0;

try {
  run('electron-vite', ['build']);
  run('npm', ['run', 'build:desktop:server']);
  cpSync('docs/prompts', 'out/server/prompts', { recursive: true });
  run('npm', ['run', 'native:electron']);
  run('electron-builder', [`--${target}`]);
} catch (error) {
  buildStatus = error instanceof CommandError ? error.status : 1;
} finally {
  restoreStatus = runAllowFailure('npm', ['run', 'native:node']);
}

if (buildStatus !== 0) {
  process.exit(buildStatus);
}

if (restoreStatus !== 0) {
  process.exit(restoreStatus);
}

function run(command, args) {
  const status = runAllowFailure(command, args);
  if (status !== 0) {
    throw new CommandError(status);
  }
}

function runAllowFailure(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return result.status ?? 1;
}
