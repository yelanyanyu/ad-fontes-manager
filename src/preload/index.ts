import { contextBridge, ipcRenderer } from 'electron';

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
});
