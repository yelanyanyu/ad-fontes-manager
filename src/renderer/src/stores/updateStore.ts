import { defineStore } from 'pinia';
import { useAppStore } from '@/stores/appStore';

type ReleaseNotesFormat = 'html' | 'markdown' | 'text';

interface StoreUpdateInfo {
  version: string;
  releaseName?: string;
  releaseNotesText: string;
  releaseNotesFormat: ReleaseNotesFormat;
}

type StoreUpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'skipped'
  | 'error';

interface StoreUpdateSnapshot {
  status: StoreUpdateStatus;
  info: StoreUpdateInfo | null;
  error?: string;
}

interface StoreUpdatePreference {
  automatic: boolean;
  skippedReleaseVersion: string | null;
  lastCheckedAt: string | null;
}

interface UpdateStoreState {
  snapshot: StoreUpdateSnapshot;
  preference: StoreUpdatePreference | null;
  installBlocked: { activeCount: number } | null;
  showDialog: boolean;
  initialized: boolean;
  unsubscribeUpdateEvent: (() => void) | null;
}

const updateActiveStatuses: StoreUpdateStatus[] = ['available', 'downloading', 'downloaded'];

export const useUpdateStore = defineStore('update', {
  state: (): UpdateStoreState => ({
    snapshot: { status: 'idle', info: null },
    preference: null,
    installBlocked: null,
    showDialog: false,
    initialized: false,
    unsubscribeUpdateEvent: null,
  }),

  getters: {
    busy: state => state.snapshot.status === 'checking' || state.snapshot.status === 'downloading',
    currentVersion: state => state.snapshot.info?.version || '',
    canInstall: state => state.snapshot.status === 'downloaded',
    canSkip: state => updateActiveStatuses.includes(state.snapshot.status),
    hasDialogContent: state => updateActiveStatuses.includes(state.snapshot.status),
    dialogTitle(): string {
      return this.currentVersion ? `发现新版本 ${this.currentVersion}` : '发现新版本';
    },
    dialogSubtitle: state => {
      if (state.snapshot.status === 'downloaded') return '更新已下载，安装后会重启应用。';
      if (state.snapshot.status === 'downloading') return '正在下载更新，下载完成后即可安装。';
      return '更新细则如下。';
    },
    statusText(): string {
      switch (this.snapshot.status) {
        case 'checking':
          return '正在检查更新...';
        case 'available':
          return `发现新版本 ${this.currentVersion}`;
        case 'downloading':
          return `正在下载 ${this.currentVersion || '新版本'}...`;
        case 'downloaded':
          return `新版本 ${this.currentVersion} 已下载`;
        case 'not-available':
          return '当前已是最新版本';
        case 'skipped':
          return `已跳过版本 ${this.currentVersion}`;
        case 'error':
          return this.snapshot.error || '更新检查失败';
        default:
          return '尚未检查';
      }
    },
  },

  actions: {
    async initialize(): Promise<void> {
      if (!window.electronAPI || this.initialized) return;
      this.initialized = true;
      await Promise.all([this.loadPreference(), this.loadSnapshot()]);
      this.unsubscribeUpdateEvent = window.electronAPI.onUpdateEvent(snapshot => {
        this.applySnapshot(snapshot, { openDownloaded: true });
      });
    },

    teardown(): void {
      this.unsubscribeUpdateEvent?.();
      this.unsubscribeUpdateEvent = null;
      this.initialized = false;
    },

    applySnapshot(snapshot: StoreUpdateSnapshot, options: { openDownloaded?: boolean } = {}): void {
      this.snapshot = snapshot;
      if (snapshot.status !== 'error') {
        this.installBlocked = null;
      }
      if (options.openDownloaded && snapshot.status === 'downloaded') {
        this.openDialog();
      }
    },

    async loadPreference(): Promise<void> {
      if (!window.electronAPI) return;
      this.preference = await window.electronAPI.getUpdatePreference();
    },

    async loadSnapshot(): Promise<void> {
      if (!window.electronAPI) return;
      this.applySnapshot(await window.electronAPI.getUpdateSnapshot());
    },

    async setAutomatic(enabled: boolean): Promise<void> {
      if (!window.electronAPI) return;
      this.preference = await window.electronAPI.setAutomaticSoftwareUpdate(enabled);
      useAppStore().addToast(enabled ? '已开启自动更新' : '已关闭自动更新', 'success');
    },

    async checkForUpdates(): Promise<void> {
      if (!window.electronAPI || this.busy) return;
      this.installBlocked = null;
      const snapshot = await window.electronAPI.checkForUpdates(true);
      this.applySnapshot(snapshot);

      const appStore = useAppStore();
      if (snapshot.status === 'not-available') {
        appStore.addToast('当前已是最新版本', 'info');
      } else if (snapshot.status === 'error') {
        appStore.addToast(snapshot.error || '更新检查失败', 'error');
      } else if (snapshot.status === 'downloaded') {
        appStore.addToast('更新已下载，可以安装', 'success');
      }

      if (snapshot.status === 'available' || snapshot.status === 'downloaded') {
        this.openDialog();
      }
    },

    async skipCurrent(): Promise<void> {
      if (!window.electronAPI || !this.currentVersion) return;
      this.preference = await window.electronAPI.skipReleaseVersion(this.currentVersion);
      this.snapshot = { ...this.snapshot, status: 'skipped' };
      this.showDialog = false;
      useAppStore().addToast(`已跳过 ${this.currentVersion}`, 'info');
    },

    async installCurrent(force = false): Promise<void> {
      if (!window.electronAPI || !this.canInstall) return;
      const result = await window.electronAPI.installUpdate({ force });
      if (result.ok) {
        this.showDialog = false;
        return;
      }

      this.installBlocked = { activeCount: result.activeCount };
      this.showDialog = true;
      useAppStore().addToast('队列仍有任务运行，安装更新前请确认', 'warning');
    },

    openDialog(): void {
      if (!this.hasDialogContent) return;
      this.showDialog = true;
    },

    closeDialog(): void {
      this.showDialog = false;
    },
  },
});
