import { spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';

// 桌面构建入口。
// 这里显式选择 pnpm 命令，是为了让 Windows 和 CI 都走同一个包管理器。
const target = process.argv[2];
const supportedTargets = new Set(['win', 'mac']);
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

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
  run(packageManager, ['run', 'build:desktop:server']);
  cpSync('docs/prompts', 'out/server/prompts', { recursive: true });
  run(packageManager, ['run', 'native:electron']);
  run('electron-builder', [`--${target}`, '--publish=never']);
} catch (error) {
  buildStatus = error instanceof CommandError ? error.status : 1;
} finally {
  restoreStatus = runAllowFailure(packageManager, ['run', 'native:node']);
}

if (buildStatus !== 0) {
  process.exit(buildStatus);
}

if (restoreStatus !== 0) {
  process.exit(restoreStatus);
}

function run(command, args) {
  // 需要失败即停的步骤走这里，避免打包失败后继续产出半成品。
  const status = runAllowFailure(command, args);
  if (status !== 0) {
    throw new CommandError(status);
  }
}

function runAllowFailure(command, args) {
  // restore 阶段也复用这个方法，因为它需要返回状态码给 finally 判断。
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return result.status ?? 1;
}
