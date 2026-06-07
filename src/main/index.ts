// Set admin token before importing the server module — config.ts reads env vars
// at import time and caches the result. In desktop mode there is no .env file,
// so we provide the same fallback the config defaults to.
process.env.ADFONTES_DESKTOP = '1';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-token-not-for-production';

import { app as electronApp, BrowserWindow, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { createApp as createServerApp } from '../server/app';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  createDesktopUpdateService,
  type DesktopUpdateConfig,
  type DesktopUpdateService,
} from './updateService';
import { DESKTOP_DATABASE_FILE_NAME, setDataDirectory } from './dataDirService';
import { getDefaultAppConfig } from '../server/utils/defaultAppConfig';

let mainWindow: BrowserWindow | null = null;
let serverInstance: http.Server | null = null;
let updateService: DesktopUpdateService | null = null;

// Desktop server port — shared with electron.vite.config.mts via env var.
// Keep in sync with the proxy target in electron.vite.config.mts.
const DESKTOP_SERVER_PORT = Number(process.env.DESKTOP_SERVER_PORT || 19876);
const CONFIG_FILE = path.join(electronApp.getPath('userData'), 'config.json');
const DIAGNOSTIC_LOG_FILE = path.join(electronApp.getPath('userData'), 'desktop-runtime.log');

process.env.ADFONTES_CONFIG_PATH = process.env.ADFONTES_CONFIG_PATH || CONFIG_FILE;

const { createApp } = require('../server/app') as {
  createApp: typeof createServerApp;
};

interface ListenError extends Error {
  code?: string;
}

const hasSingleInstanceLock = electronApp.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  electronApp.quit();
}

electronApp.on('second-instance', () => {
  writeDiagnosticLog('second-instance');
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

electronApp.on('child-process-gone', (_event, details) => {
  writeDiagnosticLog('child-process-gone', details);
});

electronApp.on('render-process-gone', (_event, _webContents, details) => {
  writeDiagnosticLog('app-render-process-gone', details);
});

function writeDiagnosticLog(message: string, details?: unknown): void {
  try {
    ensureDirectory(path.dirname(DIAGNOSTIC_LOG_FILE));
    const suffix = details === undefined ? '' : ` ${JSON.stringify(details)}`;
    fs.appendFileSync(DIAGNOSTIC_LOG_FILE, `[${new Date().toISOString()}] ${message}${suffix}\n`);
  } catch {
    // Diagnostics must never affect app startup.
  }
}

process.on('uncaughtException', error => {
  writeDiagnosticLog('uncaughtException', {
    message: error.message,
    stack: error.stack,
  });
  throw error;
});

process.on('unhandledRejection', reason => {
  writeDiagnosticLog('unhandledRejection', {
    reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
  });
});

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
    const desktopConfig = readDesktopConfig();

    if (typeof desktopConfig.dataDir === 'string' && fs.existsSync(desktopConfig.dataDir)) {
      return desktopConfig.dataDir;
    }
  } catch {
    // Fall back to the default data directory.
  }

  const fallbackDir = defaultDataDir();
  ensureDirectory(fallbackDir);
  return fallbackDir;
}

function readDesktopConfig(): DesktopUpdateConfig & { dataDir?: unknown } {
  let existingConfig: Record<string, unknown> = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingConfig = parsed as Record<string, unknown>;
      }
    }
  } catch {
    existingConfig = {};
  }
  return existingConfig as DesktopUpdateConfig & { dataDir?: unknown };
}

function writeDesktopConfigObject(config: DesktopUpdateConfig & { dataDir?: unknown }): void {
  ensureDirectory(path.dirname(CONFIG_FILE));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function writeDesktopConfig(dataDir: string): void {
  writeDesktopConfigObject({ ...readDesktopConfig(), dataDir });
}

function ensureConfig(): void {
  if (!fs.existsSync(CONFIG_FILE)) {
    const dataDir = defaultDataDir();
    ensureDirectory(dataDir);
    writeDesktopConfigObject({ ...getDefaultAppConfig(), dataDir });
  }
}

function getUpdateService(): DesktopUpdateService {
  if (!updateService) {
    updateService = createDesktopUpdateService({
      updater: autoUpdater,
      readConfig: readDesktopConfig,
      writeConfig: writeDesktopConfigObject,
      getActiveQueueCount,
      isPackaged: electronApp.isPackaged,
      currentVersion: electronApp.getVersion(),
      now: () => new Date(),
      onEvent: snapshot => {
        mainWindow?.webContents.send('updates:event', snapshot);
      },
    });
  }
  return updateService;
}

async function getActiveQueueCount(): Promise<number> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${DESKTOP_SERVER_PORT}/api/v2/generate/queue/overview`
    );
    if (!response.ok) return 0;

    const body = (await response.json()) as {
      jobs?: Array<{ status?: unknown }>;
    };
    return (body.jobs ?? []).filter(
      job => job.status === 'queued' || job.status === 'running' || job.status === 'paused'
    ).length;
  } catch (error) {
    writeDiagnosticLog('update-active-queue-check-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

function scheduleAutomaticUpdateCheck(): void {
  if (!electronApp.isPackaged) return;

  const service = getUpdateService();
  if (!service.getPreference().automatic) return;

  setTimeout(() => {
    void service.checkForUpdates({ manual: false });
  }, 10_000);
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-data-dir', () => readDataDir());

  ipcMain.handle('set-data-dir', async (_event, newPath: string) => {
    return setDataDirectory(newPath, writeDesktopConfig);
  });

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('get-app-version', () => {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    let version = '0.0.0';
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
      version = pkg.version || version;
    } catch {
      // Return the fallback version.
    }
    const year = new Date().getFullYear();
    return {
      version,
      copyright: `Copyright © ${year} yelanyanyu(Github)`,
    };
  });

  ipcMain.handle('updates:get-preference', () => getUpdateService().getPreference());
  ipcMain.handle('updates:get-snapshot', () => getUpdateService().getSnapshot());
  ipcMain.handle('updates:set-automatic', (_event, enabled: boolean) =>
    getUpdateService().setAutomaticSoftwareUpdate(Boolean(enabled))
  );
  ipcMain.handle('updates:check', (_event, manual: boolean) =>
    getUpdateService().checkForUpdates({ manual })
  );
  ipcMain.handle('updates:install', (_event, options?: { force?: boolean }) =>
    getUpdateService().installUpdate(options)
  );
  ipcMain.handle('updates:skip-version', (_event, version: string) => {
    if (typeof version !== 'string' || version.trim().length === 0) {
      throw new Error('Version is required.');
    }
    return getUpdateService().skipReleaseVersion(version);
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
}

async function createWindow(): Promise<void> {
  const dataDir = readDataDir();
  ensureDirectory(dataDir);
  const dbPath = path.join(dataDir, DESKTOP_DATABASE_FILE_NAME);

  const serverApp = createApp({
    dbPath,
    isProduction: true,
    distDir: path.join(__dirname, '..', 'renderer'),
  });

  await new Promise<void>((resolve, reject) => {
    writeDiagnosticLog('server-listen-start', { port: DESKTOP_SERVER_PORT, dbPath });
    serverInstance = serverApp.listen(DESKTOP_SERVER_PORT, '127.0.0.1');
    serverInstance.once('error', error => {
      writeDiagnosticLog('server-error', {
        message: error instanceof Error ? error.message : String(error),
        code: (error as ListenError).code,
      });
      if ((error as ListenError).code === 'EADDRINUSE') {
        reject(
          new Error(
            `Local desktop server port ${DESKTOP_SERVER_PORT} is already in use. Close the other Ad Fontes Manager window and restart the app.`
          )
        );
        return;
      }

      reject(error);
    });
    serverInstance.once('listening', () => {
      writeDiagnosticLog('server-listening', { port: DESKTOP_SERVER_PORT });
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
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 12, y: 12 },
        webPreferences: {
          preload: path.join(__dirname, '..', 'preload', 'index.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      writeDiagnosticLog('browser-window-created');
      mainWindow.webContents.on('render-process-gone', (_event, details) => {
        writeDiagnosticLog('render-process-gone', details);
      });
      mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
        writeDiagnosticLog('did-fail-load', { errorCode, errorDescription, url });
      });
      mainWindow.on('close', () => {
        writeDiagnosticLog('browser-window-close');
      });
      mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window:maximized', true);
      });
      mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window:maximized', false);
      });
      const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
      void mainWindow.loadURL(rendererDevUrl || `http://localhost:${DESKTOP_SERVER_PORT}`);
      mainWindow.on('closed', () => {
        writeDiagnosticLog('browser-window-closed');
        mainWindow = null;
      });

      resolve();
    });
  });
}

void electronApp.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  writeDiagnosticLog('app-ready');
  ensureConfig();
  registerIpcHandlers();

  try {
    await createWindow();
    scheduleAutomaticUpdateCheck();
  } catch (err) {
    writeDiagnosticLog('startup-failed', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    dialog.showErrorBox(
      'Startup failed',
      `Unable to start Ad Fontes Manager:\n${err instanceof Error ? err.message : String(err)}`
    );
    electronApp.quit();
  }
});

electronApp.on('activate', () => {
  if (!hasSingleInstanceLock) return;

  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

electronApp.on('window-all-closed', () => {
  writeDiagnosticLog('window-all-closed');
  if (serverInstance) {
    writeDiagnosticLog('server-close-from-window-all-closed');
    serverInstance.close();
    serverInstance = null;
  }

  if (process.platform !== 'darwin') {
    electronApp.quit();
  }
});

electronApp.on('before-quit', () => {
  writeDiagnosticLog('before-quit');
  if (serverInstance) {
    writeDiagnosticLog('server-close-from-before-quit');
    serverInstance.close();
    serverInstance = null;
  }
});
