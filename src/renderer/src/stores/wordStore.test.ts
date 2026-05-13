import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useWordStore } from './wordStore';

const requestGetMock = vi.hoisted(() => vi.fn());
const requestPostMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/request', () => ({
  default: {
    get: requestGetMock,
    post: requestPostMock,
    delete: vi.fn(),
  },
}));

const storage = new Map<string, string>();

beforeEach(() => {
  setActivePinia(createPinia());
  requestGetMock.mockReset();
  requestPostMock.mockReset();
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('wordStore.saveWord', () => {
  it('refreshes saved words in the background so search stays interactive', async () => {
    requestPostMock.mockResolvedValueOnce({
      success: true,
      id: 'word-1',
      lemma: 'test',
      status: 'updated',
    });
    let resolveRefresh: (value: unknown) => void = () => {};
    requestGetMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRefresh = resolve;
      })
    );

    const store = useWordStore();
    const result = await store.saveWord('yield:\n  lemma: test\n', true);

    expect(result).toBe(true);
    expect(requestGetMock).toHaveBeenCalledWith(
      '/v2/words',
      expect.objectContaining({
        params: expect.objectContaining({ page: 1, limit: 20 }),
      })
    );
    expect(store.loading).toBe(false);

    resolveRefresh({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
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
