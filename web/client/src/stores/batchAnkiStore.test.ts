import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBatchAnkiStore } from '@/stores/batchAnkiStore';

describe('batchAnkiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps task state when panel is closed', () => {
    const store = useBatchAnkiStore();
    store.items = [
      {
        key: 'db:1',
        id: '1',
        lemma: 'alpha',
        record: { id: '1', lemma: 'alpha', raw_yaml: '' } as any,
        payload: null,
        conflict: null,
        resolution: 'undecided',
        status: 'ready',
        error: '',
        noteId: null,
      },
    ];
    store.isOpen = true;
    store.isOpen = false;

    expect(store.items).toHaveLength(1);
    expect(store.items[0].lemma).toBe('alpha');
  });

  it('can reset task state explicitly', () => {
    const store = useBatchAnkiStore();
    store.items = [
      {
        key: 'db:1',
        id: '1',
        lemma: 'alpha',
        record: { id: '1', lemma: 'alpha', raw_yaml: '' } as any,
        payload: null,
        conflict: null,
        resolution: 'undecided',
        status: 'ready',
        error: '',
        noteId: null,
      },
    ];
    store.taskStarted = true;
    store.configLocked = true;
    store.summaryVisible = true;
    store.progress = { phase: 'import', processed: 1, total: 2, percent: 50 };

    store.resetTaskState();

    expect(store.items).toHaveLength(0);
    expect(store.taskStarted).toBe(false);
    expect(store.configLocked).toBe(false);
    expect(store.summaryVisible).toBe(false);
    expect(store.progress.phase).toBe('idle');
  });
});
