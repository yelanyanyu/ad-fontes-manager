import { defineStore } from 'pinia';

export interface Announcement {
  version: number;
  date: string;
  title: string;
  body_md: string;
  dismissible: boolean;
}

interface AnnouncementState {
  announcements: Announcement[];
  lastReadVersion: number;
  loading: boolean;
  error: string;
}

const LAST_READ_STORAGE_KEY = 'announcement_last_read_version';

function loadLastReadVersion(): number {
  try {
    const stored = localStorage.getItem(LAST_READ_STORAGE_KEY);
    const parsed = stored ? Number(stored) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveLastReadVersion(version: number): void {
  try {
    localStorage.setItem(LAST_READ_STORAGE_KEY, String(version));
  } catch {
    /* noop */
  }
}

export const useAnnouncementStore = defineStore('announcement', {
  state: (): AnnouncementState => ({
    announcements: [],
    lastReadVersion: loadLastReadVersion(),
    loading: false,
    error: '',
  }),

  getters: {
    latestVersion: state =>
      state.announcements.reduce((max, announcement) => Math.max(max, announcement.version), 0),
    hasUnread(): boolean {
      return this.latestVersion > this.lastReadVersion;
    },
  },

  actions: {
    async fetchAnnouncements(): Promise<void> {
      this.loading = true;
      this.error = '';

      try {
        const response = await fetch('/api/announcements');
        if (!response.ok) {
          throw new Error(`Failed to fetch announcements: ${response.status}`);
        }
        const payload = (await response.json()) as { announcements?: Announcement[] };
        this.announcements = Array.isArray(payload.announcements) ? payload.announcements : [];
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to fetch announcements';
        this.announcements = [];
      } finally {
        this.loading = false;
      }
    },

    markLatestAsRead(): void {
      const latestVersion = this.latestVersion;
      if (latestVersion <= 0) return;

      this.lastReadVersion = latestVersion;
      saveLastReadVersion(latestVersion);
    },
  },
});
