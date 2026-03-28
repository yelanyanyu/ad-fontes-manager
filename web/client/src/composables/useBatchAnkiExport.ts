import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  applyDuplicateResolution,
  checkDuplicateConflict,
  getDeckNames,
  getModelNames,
  importPayloadToAnki,
  pingAnkiConnect,
} from '@/services/ankiConnectService';
import {
  createBatchProgress,
  getImportableBatchItems,
  stepBatchProgress,
  summarizeBatchStatuses,
  updateBatchItemsResolution,
} from '@/services/batchAnkiService';
import { saveStoredAnkiExportOptions } from '@/services/ankiExportOptionsStore';
import { buildExportPayload } from '@/services/ankiPayloadBuilder';
import { useBatchAnkiStore } from '@/stores/batchAnkiStore';
import { makeWordSelectionKey } from '@/utils/wordSelection';
import type {
  BatchAnkiExportItem,
  AnkiConflictAction,
  BatchAnkiProgressPhase,
} from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

const ankiSessionCache: {
  connected: boolean;
  deckOptions: string[];
  modelOptions: string[];
} = {
  connected: false,
  deckOptions: [],
  modelOptions: [],
};

export const useBatchAnkiExport = () => {
  const batchStore = useBatchAnkiStore();
  const {
    isOpen,
    busy,
    error,
    items,
    progress,
    taskStarted,
    configLocked,
    ankiConnected,
    deckOptions,
    modelOptions,
    deckName,
    modelName,
    addReverse,
    tagsInput,
    summaryVisible,
  } = storeToRefs(batchStore);

  const tags = computed(() =>
    tagsInput.value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );

  const statusSummary = computed(() => summarizeBatchStatuses(items.value));
  const hasActiveTask = computed(() => items.value.length > 0);
  const isRunning = computed(() => progress.value.phase === 'check' || progress.value.phase === 'import');
  const canEditConfig = computed(() => !configLocked.value && !isRunning.value && !busy.value);

  const setItem = (key: string, patch: Partial<BatchAnkiExportItem>): void => {
    items.value = items.value.map(item => (item.key === key ? { ...item, ...patch } : item));
  };

  const resetCheckState = (): void => {
    items.value = items.value.map(item => ({
      ...item,
      payload: null,
      conflict: null,
      resolution: 'undecided',
      status: 'pending',
      error: '',
      noteId: null,
    }));
  };

  const persistOptions = (): void => {
    saveStoredAnkiExportOptions({
      deckName: deckName.value,
      modelName: modelName.value,
      addReverse: addReverse.value,
      tags: tags.value,
    });
  };

  const connectAnki = async (force = false): Promise<void> => {
    if (!force && ankiConnected.value && deckOptions.value.length > 0 && modelOptions.value.length > 0) {
      return;
    }

    const shouldManageBusy = !busy.value;
    if (shouldManageBusy) {
      busy.value = true;
    }
    error.value = '';
    try {
      await pingAnkiConnect();
      const [decks, models] = await Promise.all([getDeckNames(), getModelNames()]);
      deckOptions.value = decks;
      modelOptions.value = models;
      ankiConnected.value = true;
      ankiSessionCache.connected = true;
      ankiSessionCache.deckOptions = [...decks];
      ankiSessionCache.modelOptions = [...models];

      if (decks.length > 0 && !decks.includes(deckName.value)) {
        deckName.value = decks[0];
      }
      if (models.length > 0 && !models.includes(modelName.value)) {
        modelName.value = models[0];
      }
      persistOptions();
    } catch (err) {
      const e = err as { message?: string };
      ankiConnected.value = false;
      ankiSessionCache.connected = false;
      error.value = e.message || 'Failed to connect to AnkiConnect';
      throw err;
    } finally {
      if (shouldManageBusy) {
        busy.value = false;
      }
    }
  };

  const open = async (records: WordRecord[]): Promise<void> => {
    isOpen.value = true;
    error.value = '';
    summaryVisible.value = false;
    taskStarted.value = false;
    configLocked.value = false;
    items.value = records.map(record => ({
      key: makeWordSelectionKey(record),
      id: String(record.id),
      lemma: String(record.lemma || record.yield?.lemma || record.lemma_preview || record.id),
      record,
      payload: null,
      conflict: null,
      resolution: 'undecided',
      status: 'pending',
      error: '',
      noteId: null,
    }));
    progress.value = createBatchProgress('idle', 0);

    if (!ankiConnected.value) {
      try {
        await connectAnki();
      } catch {
        // Keep modal open; user can retry connect manually.
      }
    }
  };

  const reopenPanel = (): void => {
    if (items.value.length === 0) return;
    isOpen.value = true;
  };

  const close = (): void => {
    isOpen.value = false;
  };

  const dismissSummary = (): void => {
    summaryVisible.value = false;
  };

  const markTaskStarted = (): void => {
    taskStarted.value = true;
    configLocked.value = true;
  };

  const checkDuplicates = async (): Promise<void> => {
    if (!items.value.length) return;
    busy.value = true;
    error.value = '';
    summaryVisible.value = true;
    markTaskStarted();
    progress.value = createBatchProgress('check', items.value.length);

    try {
      if (!ankiConnected.value) await connectAnki(true);

      for (const item of items.value) {
        setItem(item.key, {
          status: 'checking',
          error: '',
        });

        try {
          const payload = await buildExportPayload(item.record, {
            deckName: deckName.value,
            modelName: modelName.value,
            addReverse: addReverse.value,
            tags: tags.value,
          });
          const conflict = await checkDuplicateConflict(payload);
          if (conflict) {
            setItem(item.key, {
              payload,
              conflict,
              resolution: 'undecided',
              status: 'duplicate',
            });
          } else {
            setItem(item.key, {
              payload,
              conflict: null,
              resolution: 'undecided',
              status: 'ready',
            });
          }
        } catch (err) {
          const e = err as { message?: string };
          setItem(item.key, {
            status: 'failed',
            error: e.message || 'Failed to build payload or check duplicate',
          });
        }

        progress.value = stepBatchProgress(progress.value);
      }
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Batch duplicate check failed';
    } finally {
      busy.value = false;
      progress.value = {
        ...progress.value,
        phase: 'idle',
      };
    }
  };

  const setDuplicatesResolutionAll = (action: AnkiConflictAction): void => {
    items.value = updateBatchItemsResolution(items.value, action);
  };

  const importReadyItems = async (): Promise<void> => {
    const importable = getImportableBatchItems(items.value);
    if (!importable.length) return;

    busy.value = true;
    error.value = '';
    summaryVisible.value = true;
    markTaskStarted();
    progress.value = createBatchProgress('import', importable.length);

    try {
      if (!ankiConnected.value) await connectAnki(true);

      for (const item of importable) {
        setItem(item.key, {
          status: 'importing',
          error: '',
        });
        try {
          if (!item.payload) {
            throw new Error('Payload not prepared; please run duplicate check first.');
          }
          if (item.status === 'duplicate' && item.conflict && item.resolution === 'skip') {
            setItem(item.key, {
              status: 'skipped',
            });
          } else if (
            item.status === 'duplicate' &&
            item.conflict &&
            item.resolution === 'overwrite'
          ) {
            const result = await applyDuplicateResolution(
              item.payload,
              item.conflict,
              'overwrite'
            );
            if ('skipped' in result) {
              setItem(item.key, {
                status: 'skipped',
              });
            } else {
              setItem(item.key, {
                status: 'overwritten',
                noteId: result.noteId,
              });
            }
          } else {
            const result = await importPayloadToAnki(item.payload);
            setItem(item.key, {
              status: 'imported',
              noteId: result.noteId,
            });
          }
        } catch (err) {
          const e = err as { message?: string };
          setItem(item.key, {
            status: 'failed',
            error: e.message || 'Import failed',
          });
        }

        progress.value = stepBatchProgress(progress.value);
      }
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Batch import failed';
    } finally {
      busy.value = false;
      progress.value = {
        ...progress.value,
        phase: 'idle',
      };
    }
  };

  watch([deckName, modelName, addReverse, tagsInput], () => {
    persistOptions();
    if (!isOpen.value || configLocked.value) return;
    resetCheckState();
  });

  const progressLabel = computed(() => {
    const phase = progress.value.phase as BatchAnkiProgressPhase;
    if (phase === 'check') return `Checking duplicates ${progress.value.processed}/${progress.value.total}`;
    if (phase === 'import') return `Importing to Anki ${progress.value.processed}/${progress.value.total}`;
    return '';
  });

  const stageLabel = computed(() => {
    if (progress.value.phase === 'check') return 'Checking';
    if (progress.value.phase === 'import') return 'Importing';
    if (busy.value) return 'Running';
    if (hasActiveTask.value) return 'Idle';
    return 'Idle';
  });

  if (ankiSessionCache.connected && deckOptions.value.length === 0 && modelOptions.value.length === 0) {
    ankiConnected.value = true;
    deckOptions.value = [...ankiSessionCache.deckOptions];
    modelOptions.value = [...ankiSessionCache.modelOptions];
  }

  return {
    isOpen,
    busy,
    error,
    items,
    deckName,
    modelName,
    addReverse,
    tagsInput,
    ankiConnected,
    deckOptions,
    modelOptions,
    progress,
    progressLabel,
    stageLabel,
    statusSummary,
    hasActiveTask,
    canEditConfig,
    summaryVisible,
    open,
    close,
    reopenPanel,
    dismissSummary,
    connectAnki,
    checkDuplicates,
    setDuplicatesResolutionAll,
    importReadyItems,
  };
};
