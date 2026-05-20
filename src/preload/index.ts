import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const ADMIN_TOKEN = 'dev-token-not-for-production';

contextBridge.exposeInMainWorld('electronAPI', {
  adminToken: ADMIN_TOKEN,
  getDataDir: () => ipcRenderer.invoke('get-data-dir') as Promise<string>,
  setDataDir: (newPath: string) =>
    ipcRenderer.invoke('set-data-dir', newPath) as Promise<{
      success: boolean;
      message: string;
    }>,
  selectDirectory: () => ipcRenderer.invoke('select-directory') as Promise<string | null>,
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version') as Promise<{ version: string; copyright: string }>,
  getUpdatePreference: () => ipcRenderer.invoke('updates:get-preference'),
  getUpdateSnapshot: () => ipcRenderer.invoke('updates:get-snapshot') as Promise<unknown>,
  setAutomaticSoftwareUpdate: (enabled: boolean) =>
    ipcRenderer.invoke('updates:set-automatic', enabled),
  checkForUpdates: (manual = true) => ipcRenderer.invoke('updates:check', manual),
  installUpdate: (options?: { force?: boolean }) => ipcRenderer.invoke('updates:install', options),
  skipReleaseVersion: (version: string) => ipcRenderer.invoke('updates:skip-version', version),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize') as Promise<boolean>,
  closeWindow: () => ipcRenderer.invoke('window:close') as Promise<void>,
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
  onWindowMaximized: (callback: (maximized: boolean) => void) => {
    const listener = (_event: IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized', listener);
    return () => ipcRenderer.removeListener('window:maximized', listener);
  },
  onUpdateEvent: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on('updates:event', listener);
    return () => ipcRenderer.removeListener('updates:event', listener);
  },
});
