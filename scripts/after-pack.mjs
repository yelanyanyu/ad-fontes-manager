import { cp, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as asar from '@electron/asar';
import * as ResEdit from 'resedit';

// 这些包本来属于生产依赖图，但 pnpm + electron-builder 可能漏收深层小依赖。
// afterPack 阶段直接修补 app.asar，比依赖 files 规则更可靠。
const pnpmRuntimeDependencyPatches = [
  '@babel/helper-string-parser',
  '@babel/helper-validator-identifier',
  '@babel/parser',
  '@babel/types',
  '@jridgewell/sourcemap-codec',
  '@marijn/find-cluster-break',
  '@types/better-sqlite3',
  '@types/node',
  '@vue/compiler-core',
  '@vue/compiler-dom',
  '@vue/compiler-sfc',
  '@vue/compiler-ssr',
  '@vue/reactivity',
  '@vue/runtime-core',
  '@vue/runtime-dom',
  '@vue/server-renderer',
  '@vue/shared',
  'argparse',
  'call-bound',
  'csstype',
  'ee-first',
  'estree-walker',
  'json-schema',
  'magic-string',
  'media-typer',
  'nanoid',
  'object-inspect',
  'picocolors',
  'postcss',
  'setprototypeof',
  'side-channel',
  'side-channel-list',
  'side-channel-map',
  'side-channel-weakmap',
  'source-map-js',
  'split2',
  'style-mod',
  'toidentifier',
  'typescript',
  'undici-types',
  'w3c-keyname',
  'wrappy',
];

/**
 * 打包完成后，补齐 pnpm 场景下 electron-builder 漏收的运行时依赖。
 * 这里处理的是 app.asar 本身，目标是让桌面包离开开发机后也能独立启动。
 */
export default async function afterPack(context) {
  await patchPnpmRuntimeDependencies(context);

  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'assets', 'icon.ico');

  const [exeBuffer, iconBuffer] = await Promise.all([readFile(exePath), readFile(iconPath)]);
  const executable = ResEdit.NtExecutable.from(exeBuffer);
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconFile = ResEdit.Data.IconFile.from(iconBuffer);

  // Electron shortcuts use the packaged exe as their icon source, so the icon
  // resource must be embedded before NSIS creates desktop/start-menu shortcuts.
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    1,
    1033,
    iconFile.icons.map(item => item.data)
  );

  resources.outputResource(executable);
  await writeFile(exePath, Buffer.from(executable.generate()));
}

/**
 * 找到当前平台的 app.asar。Windows 和 Linux 的路径比较直接，macOS 会多一层 .app。
 */
async function findAppAsarPath(context) {
  const productFilename = context.packager.appInfo.productFilename;
  const candidates = [
    path.join(context.appOutDir, 'resources', 'app.asar'),
    path.join(context.appOutDir, `${productFilename}.app`, 'Contents', 'Resources', 'app.asar'),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Cannot find packaged app.asar in ${context.appOutDir}`);
}

/**
 * 从根 node_modules 复制一个包到解开的 asar 目录中。
 */
async function copyRuntimePackage(projectDir, extractDir, packageName) {
  const packageSegments = packageName.split('/');
  const source = path.join(projectDir, 'node_modules', ...packageSegments);
  const target = path.join(extractDir, 'node_modules', ...packageSegments);

  if (await pathExists(target)) {
    return false;
  }

  if (!(await pathExists(source))) {
    throw new Error(`Cannot patch app.asar because ${source} does not exist`);
  }

  // 只复制缺失的包，避免覆盖 electron-builder 已经正确收进来的内容。
  await cp(source, target, { recursive: true });
  return true;
}

/**
 * 解开 app.asar，补包，再重新生成 app.asar。
 */
async function patchPnpmRuntimeDependencies(context) {
  const appAsarPath = await findAppAsarPath(context);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ad-fontes-asar-patch-'));
  const extractDir = path.join(tempDir, 'app');
  const patchedAsarPath = `${appAsarPath}.patched`;

  try {
    asar.extractAll(appAsarPath, extractDir);

    const copiedPackages = [];
    for (const packageName of pnpmRuntimeDependencyPatches) {
      if (await copyRuntimePackage(context.packager.projectDir, extractDir, packageName)) {
        copiedPackages.push(packageName);
      }
    }

    if (copiedPackages.length === 0) {
      return;
    }

    await asar.createPackage(extractDir, patchedAsarPath);
    await rm(appAsarPath, { force: true });
    await rename(patchedAsarPath, appAsarPath);
    asar.uncache(appAsarPath);
    console.log(`Patched app.asar with pnpm runtime dependencies: ${copiedPackages.join(', ')}`);
  } finally {
    await rm(patchedAsarPath, { force: true });
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * 小心探测路径是否存在，避免把“没有这个文件”当成真正的打包错误。
 */
async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
