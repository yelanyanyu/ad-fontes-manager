import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useAnnouncementStore } from './announcementStore';

const storage = new Map<string, string>();

beforeEach(() => {
  setActivePinia(createPinia());
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('announcementStore', () => {
  it('detects unread announcements newer than the stored version', () => {
    storage.set('announcement_last_read_version', '1');
    const store = useAnnouncementStore();

    store.announcements = [
      {
        version: 2,
        date: '2026-05-04',
        title: 'v1.9.0 更新公告',
        body_md: '## 新功能',
        dismissible: true,
      },
    ];

    expect(store.latestVersion).toBe(2);
    expect(store.hasUnread).toBe(true);
  });

  it('persists the latest version when marked as read', () => {
    const store = useAnnouncementStore();
    store.announcements = [
      {
        version: 3,
        date: '2026-05-04',
        title: 'v2.0.0 更新公告',
        body_md: '## 改进',
        dismissible: true,
      },
    ];

    store.markLatestAsRead();

    expect(store.lastReadVersion).toBe(3);
    expect(storage.get('announcement_last_read_version')).toBe('3');
    expect(store.hasUnread).toBe(false);
  });
});
