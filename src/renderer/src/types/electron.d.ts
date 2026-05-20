interface UpdatePreference {
  automatic: boolean;
  skippedReleaseVersion: string | null;
  lastCheckedAt: string | null;
}

interface UpdateInfo {
  version: string;
  releaseName?: string;
  releaseNotesText: string;
}

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'skipped'
  | 'error';

interface UpdateSnapshot {
  status: UpdateStatus;
  info: UpdateInfo | null;
  error?: string;
}

type InstallUpdateResult =
  | { ok: true }
  | { ok: false; reason: 'active-queue'; activeCount: number };

interface ElectronAPI {
  readonly adminToken: string;
  getDataDir: () => Promise<string>;
  setDataDir: (path: string) => Promise<{ success: boolean; message: string }>;
  selectDirectory: () => Promise<string | null>;
  getAppVersion: () => Promise<{ version: string; copyright: string }>;
  getUpdatePreference: () => Promise<UpdatePreference>;
  setAutomaticSoftwareUpdate: (enabled: boolean) => Promise<UpdatePreference>;
  checkForUpdates: (manual?: boolean) => Promise<UpdateSnapshot>;
  installUpdate: (options?: { force?: boolean }) => Promise<InstallUpdateResult>;
  skipReleaseVersion: (version: string) => Promise<UpdatePreference>;
  onUpdateEvent: (callback: (snapshot: UpdateSnapshot) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
