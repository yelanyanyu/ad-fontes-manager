import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useWordStore } from './wordStore';

const requestGetMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/request', () => ({
  default: {
    get: requestGetMock,
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const storage = new Map<string, string>();

beforeEach(() => {
  setActivePinia(createPinia());
  requestGetMock.mockReset();
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('wordStore.fetchDbRecords', () => {
  it('sets loading for user-visible fetches', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    requestGetMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );

    const store = useWordStore();
    const pending = store.fetchDbRecords();

    expect(store.loading).toBe(true);

    resolveRequest({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
    await pending;

    expect(store.loading).toBe(false);
  });

  it('keeps loading false for background refreshes', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    requestGetMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRequest = resolve;
      })
    );

    const store = useWordStore();
    const pending = store.fetchDbRecords({ background: true });

    expect(store.loading).toBe(false);

    resolveRequest({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
    await pending;

    expect(store.loading).toBe(false);
  });
});
