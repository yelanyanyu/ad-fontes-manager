import fs from 'node:fs';
import path from 'node:path';

export const DESKTOP_DATABASE_FILE_NAME = 'ad_fontes.db';

export interface SetDataDirectoryResult {
  success: true;
  dataDir: string;
  dbPath: string;
  createdDatabase: boolean;
  message: string;
}

export function createEmptyDatabaseFile(dbPath: string): boolean {
  try {
    const handle = fs.openSync(dbPath, 'wx');
    fs.closeSync(handle);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

export function setDataDirectory(
  newPath: string,
  writeDataDir: (dataDir: string) => void
): SetDataDirectoryResult {
  if (typeof newPath !== 'string' || newPath.trim().length === 0) {
    throw new Error('Directory path is required.');
  }

  const resolvedPath = path.resolve(newPath);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    throw new Error('Directory does not exist.');
  }

  const dbPath = path.join(resolvedPath, DESKTOP_DATABASE_FILE_NAME);
  const createdDatabase = !fs.existsSync(dbPath) && createEmptyDatabaseFile(dbPath);

  writeDataDir(resolvedPath);

  return {
    success: true,
    dataDir: resolvedPath,
    dbPath,
    createdDatabase,
    message: createdDatabase
      ? '当前目录没有数据库文件，已新建空数据库。重启应用后将使用新目录。'
      : '数据目录已更新。重启应用后将使用新目录。',
  };
}
