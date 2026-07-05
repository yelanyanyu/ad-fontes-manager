import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as asar from '@electron/asar';

import afterPack from './after-pack.mjs';

/**
 * afterPack 需要修补 electron-builder 在 pnpm 场景下漏收的深层依赖。
 * 这个测试用最小 asar 验证补包动作，不依赖完整桌面构建。
 */
test('afterPack patches missing pnpm runtime packages into app.asar', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ad-fontes-after-pack-test-'));

  try {
    const appOutDir = path.join(tempDir, 'win-unpacked');
    const resourcesDir = path.join(appOutDir, 'resources');
    const fixtureDir = path.join(tempDir, 'fixture-app');
    const fixtureNodeModulesDir = path.join(fixtureDir, 'node_modules');
    const appAsarPath = path.join(resourcesDir, 'app.asar');

    await mkdir(resourcesDir, { recursive: true });
    await mkdir(fixtureNodeModulesDir, { recursive: true });
    await writeFile(path.join(fixtureDir, 'package.json'), '{"name":"fixture"}\n');

    // fixture 里故意不放 ee-first / wrappy，模拟 electron-builder 漏收后的 asar。
    await asar.createPackage(fixtureDir, appAsarPath);

    await afterPack({
      electronPlatformName: 'linux',
      appOutDir,
      packager: {
        projectDir: process.cwd(),
        appInfo: {
          productFilename: 'ad-fontes-manager',
        },
      },
    });

    // 同一进程刚重写 asar 后，要避开 @electron/asar 对旧 header 的缓存。
    asar.uncache(appAsarPath);
    const packagedFiles = asar
      .listPackage(appAsarPath)
      .map(filePath => filePath.replace(/\\/g, '/'));

    assert.ok(
      packagedFiles.some(filePath => filePath.includes('/node_modules/ee-first/index.js')),
      'ee-first should be patched into app.asar'
    );
    assert.ok(
      packagedFiles.some(filePath => filePath.includes('/node_modules/wrappy/wrappy.js')),
      'wrappy should be patched into app.asar'
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
