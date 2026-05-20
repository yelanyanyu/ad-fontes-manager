import type { EventEmitter } from 'node:events';

export interface DesktopUpdateConfig {
  updates?: {
    automatic?: boolean;
    skippedReleaseVersion?: string | null;
    lastCheckedAt?: string | null;
  };
}

export interface UpdatePreference {
  automatic: boolean;
  skippedReleaseVersion: string | null;
  lastCheckedAt: string | null;
}

export interface UpdateInfo {
  version: string;
  releaseName?: string;
  releaseNotesText: string;
  releaseNotesFormat: 'html' | 'markdown' | 'text';
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'skipped'
  | 'error';

export interface UpdateSnapshot {
  status: UpdateStatus;
  info: UpdateInfo | null;
  error?: string;
}

export type InstallUpdateResult =
  | { ok: true }
  | { ok: false; reason: 'active-queue'; activeCount: number };

export type RawReleaseNotes = string | Array<{ version?: string | null; note?: string | null }>;

export interface RawUpdateInfo {
  version?: string;
  releaseName?: string | null;
  releaseNotes?: RawReleaseNotes | null;
}

export interface UpdaterLike extends Pick<EventEmitter, 'on'> {
  autoDownload?: boolean;
  autoInstallOnAppQuit?: boolean;
  forceDevUpdateConfig?: boolean;
  checkForUpdates(): Promise<{ updateInfo?: RawUpdateInfo } | null | undefined>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

interface DesktopUpdateServiceOptions {
  updater: UpdaterLike;
  readConfig: () => DesktopUpdateConfig;
  writeConfig: (config: DesktopUpdateConfig) => void;
  getActiveQueueCount: () => Promise<number>;
  isPackaged: boolean;
  currentVersion: string;
  now: () => Date;
  onEvent?: (snapshot: UpdateSnapshot) => void;
}

export interface DesktopUpdateService {
  getPreference(): UpdatePreference;
  setAutomaticSoftwareUpdate(enabled: boolean): UpdatePreference;
  skipReleaseVersion(version: string): UpdatePreference;
  checkForUpdates(options?: { manual?: boolean }): Promise<UpdateSnapshot>;
  installUpdate(options?: { force?: boolean }): Promise<InstallUpdateResult>;
}

export function createDesktopUpdateService(
  options: DesktopUpdateServiceOptions
): DesktopUpdateService {
  const { updater } = options;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  if (!options.isPackaged) {
    updater.forceDevUpdateConfig = true;
  }

  let currentSnapshot: UpdateSnapshot = { status: 'idle', info: null };

  const emitSnapshot = (snapshot: UpdateSnapshot): UpdateSnapshot => {
    currentSnapshot = snapshot;
    options.onEvent?.(snapshot);
    return snapshot;
  };

  updater.on('download-progress', () => {
    emitSnapshot({ ...currentSnapshot, status: 'downloading' });
  });
  updater.on('update-downloaded', rawInfo => {
    emitSnapshot({ status: 'downloaded', info: normalizeUpdateInfo(rawInfo) });
  });
  updater.on('update-not-available', rawInfo => {
    emitSnapshot({ status: 'not-available', info: normalizeUpdateInfo(rawInfo) });
  });
  updater.on('error', error => {
    emitSnapshot({
      ...currentSnapshot,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const readPreference = (): UpdatePreference => {
    const updates = options.readConfig().updates;
    return {
      automatic: updates?.automatic ?? true,
      skippedReleaseVersion: updates?.skippedReleaseVersion ?? null,
      lastCheckedAt: updates?.lastCheckedAt ?? null,
    };
  };

  const writeUpdates = (next: Partial<NonNullable<DesktopUpdateConfig['updates']>>) => {
    const config = options.readConfig();
    options.writeConfig({
      ...config,
      updates: {
        ...config.updates,
        ...next,
      },
    });
  };

  return {
    getPreference: readPreference,

    setAutomaticSoftwareUpdate(enabled: boolean): UpdatePreference {
      writeUpdates({ automatic: enabled });
      return readPreference();
    },

    skipReleaseVersion(version: string): UpdatePreference {
      writeUpdates({ skippedReleaseVersion: version });
      return readPreference();
    },

    async checkForUpdates(): Promise<UpdateSnapshot> {
      emitSnapshot({ status: 'checking', info: currentSnapshot.info });
      writeUpdates({ lastCheckedAt: options.now().toISOString() });

      try {
        const result = await updater.checkForUpdates();
        const info = normalizeUpdateInfo(result?.updateInfo);

        if (!info || !isNewerVersion(info.version, options.currentVersion)) {
          return emitSnapshot({ status: 'not-available', info: null });
        }

        const preference = readPreference();
        if (preference.skippedReleaseVersion === info.version) {
          return emitSnapshot({ status: 'skipped', info });
        }

        if (preference.automatic && options.isPackaged) {
          emitSnapshot({ status: 'downloading', info });
          await updater.downloadUpdate();
          return emitSnapshot({ status: 'downloaded', info });
        }

        return emitSnapshot({ status: 'available', info });
      } catch (error) {
        return emitSnapshot({
          status: 'error',
          info: currentSnapshot.info,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async installUpdate(optionsForInstall?: { force?: boolean }): Promise<InstallUpdateResult> {
      const activeCount = await options.getActiveQueueCount();
      if (activeCount > 0 && !optionsForInstall?.force) {
        return { ok: false, reason: 'active-queue', activeCount };
      }

      updater.quitAndInstall(false, true);
      return { ok: true };
    },
  };
}

export function selectReleaseNotesText(
  notes: RawReleaseNotes | null | undefined,
  locale = 'zh-CN'
): string {
  const rawText = releaseNotesToText(notes);
  const requestedLanguage = locale.toLowerCase();
  const languageCandidates = [
    requestedLanguage,
    requestedLanguage.split('-')[0],
    requestedLanguage.startsWith('zh') ? 'zh-cn' : 'en',
    'en',
  ];

  for (const language of languageCandidates) {
    const localized = extractLanguageBlock(rawText, language);
    if (localized) return localized;
  }

  return rawText.trim();
}

export function detectReleaseNotesFormat(text: string): UpdateInfo['releaseNotesFormat'] {
  const trimmed = text.trim();
  if (!trimmed) return 'text';
  if (/<\/?(h[1-6]|p|ul|ol|li|code|pre|strong|em|a|br|blockquote)\b/i.test(trimmed)) {
    return 'html';
  }
  if (/^#{1,6}\s|\n#{1,6}\s|^\s*[-*+]\s|\n\s*[-*+]\s|`[^`]+`|\*\*[^*]+\*\*/m.test(trimmed)) {
    return 'markdown';
  }
  return 'text';
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = parseVersion(candidate);
  const currentParts = parseVersion(current);
  if (!candidateParts || !currentParts) return candidate !== current;

  for (let index = 0; index < 3; index += 1) {
    if (candidateParts[index] > currentParts[index]) return true;
    if (candidateParts[index] < currentParts[index]) return false;
  }

  return false;
}

function normalizeUpdateInfo(rawInfo: RawUpdateInfo | null | undefined): UpdateInfo | null {
  if (!rawInfo?.version) return null;
  const releaseNotesText = selectReleaseNotesText(rawInfo.releaseNotes);
  return {
    version: rawInfo.version,
    releaseName: rawInfo.releaseName ?? undefined,
    releaseNotesText,
    releaseNotesFormat: detectReleaseNotesFormat(releaseNotesText),
  };
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function releaseNotesToText(notes: RawReleaseNotes | null | undefined): string {
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) {
    return notes
      .map(note => note.note)
      .filter((note): note is string => typeof note === 'string')
      .join('\n\n');
  }
  return '';
}

function extractLanguageBlock(text: string, language: string): string | null {
  const escapedLanguage = language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(
    `<!--\\s*LANG:${escapedLanguage}\\s*-->([\\s\\S]*?)<!--\\s*LANG:END\\s*-->`,
    'i'
  );
  return matcher.exec(text)?.[1]?.trim() ?? null;
}
