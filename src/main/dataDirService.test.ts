import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DESKTOP_DATABASE_FILE_NAME, setDataDirectory } from './dataDirService';

function withTempDir(test: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-fontes-data-dir-'));
  try {
    test(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

void describe('desktop data directory service', () => {
  void it('creates an empty database file when the selected directory has none', () => {
    withTempDir(dir => {
      let writtenDir = '';

      const result = setDataDirectory(dir, dataDir => {
        writtenDir = dataDir;
      });

      const dbPath = path.join(dir, DESKTOP_DATABASE_FILE_NAME);
      assert.equal(result.createdDatabase, true);
      assert.equal(result.dataDir, dir);
      assert.equal(result.dbPath, dbPath);
      assert.equal(writtenDir, dir);
      assert.equal(fs.existsSync(dbPath), true);
      assert.equal(fs.statSync(dbPath).size, 0);
      assert.match(result.message, /已新建空数据库/);
    });
  });

  void it('preserves an existing database file instead of replacing it', () => {
    withTempDir(dir => {
      const dbPath = path.join(dir, DESKTOP_DATABASE_FILE_NAME);
      fs.writeFileSync(dbPath, 'NEW_DB_SENTINEL', 'utf-8');
      let writtenDir = '';

      const result = setDataDirectory(dir, dataDir => {
        writtenDir = dataDir;
      });

      assert.equal(result.createdDatabase, false);
      assert.equal(writtenDir, dir);
      assert.equal(fs.readFileSync(dbPath, 'utf-8'), 'NEW_DB_SENTINEL');
      assert.doesNotMatch(result.message, /已新建空数据库/);
    });
  });

  void it('rejects missing directories without writing config', () => {
    const missingDir = path.join(os.tmpdir(), `ad-fontes-missing-${Date.now()}`);
    let wroteConfig = false;

    assert.throws(
      () =>
        setDataDirectory(missingDir, () => {
          wroteConfig = true;
        }),
      /Directory does not exist/
    );
    assert.equal(wroteConfig, false);
  });
});
