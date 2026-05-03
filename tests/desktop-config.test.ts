import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

void test('desktop mode does not exit when NODE_ENV=production and cwd has .env', () => {
  const result = spawnSync(
    process.execPath,
    [
      './node_modules/tsx/dist/cli.mjs',
      '-e',
      "require('./src/server/utils/config.ts'); console.log('config loaded');",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ADFONTES_DESKTOP: '1',
      },
      encoding: 'utf-8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /config loaded/);
});
