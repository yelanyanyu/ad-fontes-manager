import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useAnnouncementStore } from './announcementStore';

const storage = new Map<string, string>();

beforeEach(() => {
  vi.unstubAllGlobals();
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

  it('stores announcement source notices returned by the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          announcements: [],
          sourceNotice: {
            source: 'github',
            level: 'warning',
            message: '无法连接 GitHub Release，当前显示本地缓存公告。',
            detail: 'network unavailable',
          },
        }),
      })
    );
    const store = useAnnouncementStore();

    await store.fetchAnnouncements();

    expect(store.sourceNotice).toEqual({
      source: 'github',
      level: 'warning',
      message: '无法连接 GitHub Release，当前显示本地缓存公告。',
      detail: 'network unavailable',
    });
    expect(store.error).toBe('');
  });
});
