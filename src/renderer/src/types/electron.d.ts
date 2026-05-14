interface ElectronAPI {
  readonly adminToken: string;
  getDataDir: () => Promise<string>;
  setDataDir: (path: string) => Promise<{ success: boolean; message: string }>;
  selectDirectory: () => Promise<string | null>;
  getAppVersion: () => Promise<{ version: string; copyright: string }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
