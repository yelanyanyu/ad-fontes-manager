import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---- Tracer bullet: checkFileRenameLock ----

void describe('checkFileRenameLock', () => {
  let checkFileRenameLock;

  before(async () => {
    const mod = await import('./native-lock.mjs');
    checkFileRenameLock = mod.checkFileRenameLock;
  });

  void it('returns { locked: false } for a writable file that is not loaded', () => {
    const tmpFile = path.join(os.tmpdir(), `native-lock-test-${process.pid}.tmp`);
    fs.writeFileSync(tmpFile, 'test');

    try {
      const result = checkFileRenameLock(tmpFile);
      assert.equal(result.locked, false);
      assert.equal(result.error, undefined);
    } finally {
      fs.rmSync(tmpFile, { force: true });
    }
  });

  void it('returns { locked: false } for a non-existent file', () => {
    const result = checkFileRenameLock(
      path.join(os.tmpdir(), `does-not-exist-${Date.now()}.node`)
    );
    assert.equal(result.locked, false);
  });
});

// ---- findProcessesLoadingFile ----

void describe('findProcessesLoadingFile', () => {
  let findProcessesLoadingFile;

  before(async () => {
    const mod = await import('./native-lock.mjs');
    findProcessesLoadingFile = mod.findProcessesLoadingFile;
  });

  void it('returns empty array when no process has the file loaded', () => {
    const result = findProcessesLoadingFile(
      path.join(os.tmpdir(), `no-process-has-this-${Date.now()}.node`)
    );
    assert.deepEqual(result, []);
  });

  void it('returns array of process info objects with expected shape', () => {
    const result = findProcessesLoadingFile('node_modules/better-sqlite3/build/Release/better_sqlite3.node');
    // May be empty or have entries — either is valid.
    assert.ok(Array.isArray(result), 'should return an array');
    for (const entry of result) {
      assert.ok(typeof entry.pid === 'number', 'each entry should have numeric pid');
      assert.ok(typeof entry.name === 'string', 'each entry should have string name');
    }
  });
});
