import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const nativeRelativePath = path.join(
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

const packagedNativeCandidates = [
  path.join(
    rootDir,
    'release',
    'win-unpacked',
    'resources',
    'app.asar.unpacked',
    nativeRelativePath
  ),
  path.join(
    rootDir,
    'release',
    'mac',
    'Ad Fontes Manager.app',
    'Contents',
    'Resources',
    'app.asar.unpacked',
    nativeRelativePath
  ),
];

const existingPackagedNatives = packagedNativeCandidates.filter(candidate =>
  fs.existsSync(candidate)
);
const snapshots = existingPackagedNatives.map(candidate => {
  const snapshot = path.join(
    os.tmpdir(),
    `ad-fontes-${path.basename(candidate)}-${process.pid}-${snapshotsRandomSuffix()}.node`
  );
  fs.copyFileSync(candidate, snapshot);
  return { candidate, snapshot };
});

const rebuildResult = spawnSync('npm', ['rebuild', 'better-sqlite3'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (rebuildResult.status !== 0) {
  process.exit(rebuildResult.status ?? 1);
}

for (const { candidate, snapshot } of snapshots) {
  fs.rmSync(candidate, { force: true });
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  fs.copyFileSync(snapshot, candidate);
  fs.rmSync(snapshot, { force: true });
}

function snapshotsRandomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
