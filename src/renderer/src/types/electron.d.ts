interface ElectronAPI {
  readonly adminToken: string;
  getDataDir: () => Promise<string>;
  setDataDir: (path: string) => Promise<{ success: boolean; message: string }>;
  selectDirectory: () => Promise<string | null>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
