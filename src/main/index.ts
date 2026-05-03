// Set admin token before importing the server module — config.ts reads env vars
// at import time and caches the result. In desktop mode there is no .env file,
// so we provide the same fallback the config defaults to.
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-token-not-for-production';

import { app as electronApp, BrowserWindow, dialog, ipcMain } from 'electron';
import type { createApp as createServerApp } from '../server/app';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const { createApp } = require('../server/app') as {
  createApp: typeof createServerApp;
};

let mainWindow: BrowserWindow | null = null;
let serverInstance: http.Server | null = null;

const CONFIG_FILE = path.join(electronApp.getPath('userData'), 'config.json');

function ensureDirectory(targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function defaultDataDir(): string {
  return path.join(electronApp.getPath('userData'), 'data');
}

function readDataDir(): string {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const desktopConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as {
        dataDir?: unknown;
      };

      if (typeof desktopConfig.dataDir === 'string' && fs.existsSync(desktopConfig.dataDir)) {
        return desktopConfig.dataDir;
      }
    }
  } catch {
    // Fall back to the default data directory.
  }

  const fallbackDir = defaultDataDir();
  ensureDirectory(fallbackDir);
  return fallbackDir;
}

function writeDesktopConfig(dataDir: string): void {
  ensureDirectory(path.dirname(CONFIG_FILE));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ dataDir }, null, 2));
}

function ensureConfig(): void {
  if (!fs.existsSync(CONFIG_FILE)) {
    const dataDir = defaultDataDir();
    ensureDirectory(dataDir);
    writeDesktopConfig(dataDir);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-data-dir', () => readDataDir());

  ipcMain.handle('set-data-dir', async (_event, newPath: string) => {
    if (typeof newPath !== 'string' || newPath.trim().length === 0) {
      throw new Error('Directory path is required.');
    }

    const resolvedPath = path.resolve(newPath);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new Error('Directory does not exist.');
    }

    const currentDir = readDataDir();
    const oldDb = path.join(currentDir, 'ad_fontes.db');
    const newDb = path.join(resolvedPath, 'ad_fontes.db');
    if (fs.existsSync(oldDb) && !fs.existsSync(newDb)) {
      fs.copyFileSync(oldDb, newDb);
    }

    writeDesktopConfig(resolvedPath);
    return {
      success: true,
      message: 'Data directory updated. Restart the application to use the new path.',
    };
  });

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
}

async function createWindow(): Promise<void> {
  const dataDir = readDataDir();
  ensureDirectory(dataDir);
  const dbPath = path.join(dataDir, 'ad_fontes.db');

  const serverApp = createApp({
    dbPath,
    isProduction: true,
    distDir: path.join(__dirname, '..', 'renderer'),
  });

  await new Promise<void>((resolve, reject) => {
    serverInstance = serverApp.listen(0, '127.0.0.1');
    serverInstance.once('error', reject);
    serverInstance.once('listening', () => {
      const address = serverInstance?.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine local server port.'));
        return;
      }

      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        webPreferences: {
          preload: path.join(__dirname, '..', 'preload', 'index.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      void mainWindow.loadURL(`http://localhost:${address.port}`);
      mainWindow.on('closed', () => {
        mainWindow = null;
      });

      resolve();
    });
  });
}

void electronApp.whenReady().then(async () => {
  ensureConfig();
  registerIpcHandlers();

  try {
    await createWindow();
  } catch (err) {
    dialog.showErrorBox(
      'Startup failed',
      `Unable to start Ad Fontes Manager:\n${err instanceof Error ? err.message : String(err)}`
    );
    electronApp.quit();
  }
});

electronApp.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

electronApp.on('window-all-closed', () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }

  if (process.platform !== 'darwin') {
    electronApp.quit();
  }
});

electronApp.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
});
