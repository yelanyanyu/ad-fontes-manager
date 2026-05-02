import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  checkDuplicateConflict,
  getDeckNames,
  getModelFieldNames,
  getModelNames,
  getModelStyling,
  getModelTemplates,
  importPayloadWithStrategy,
  isAnkiDuplicateConflictError,
  pingAnkiConnect,
} from '@/services/ankiConnectService';
import {
  createBatchProgress,
  getImportableBatchItems,
  markPendingItemsCancelled,
  stepBatchProgress,
  summarizeBatchStatuses,
  updateBatchItemsResolution,
} from '@/services/batchAnkiService';
import { saveStoredAnkiExportOptions } from '@/services/ankiExportOptionsStore';
import {
  getRecommendedMapping,
  hasStoredFieldMapping,
  loadFieldMapping,
  saveFieldMapping,
} from '@/services/ankiFieldMappingStore';
import { buildExportPayload } from '@/services/ankiPayloadBuilder';
import { exportApkgByIds, exportBatchApkgViaAnkiConnect } from '@/services/apkgExportService';
import { useBatchAnkiStore } from '@/stores/batchAnkiStore';
import { makeWordSelectionKey } from '@/utils/wordSelection';
import type {
  AnkiConflictAction,
  AnkiModelTemplate,
  BatchAnkiExportItem,
  BatchAnkiProgressPhase,
  FieldMappingConfig,
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

const BACKEND_BY_IDS_EXPORT_THRESHOLD = 100;

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
    cancelRequested,
    canResume,
    lastStoppedPhase,
    ankiConnected,
    deckOptions,
    modelOptions,
    modelFieldNames,
    templateOptions,
    deckName,
    modelName,
    templateName,
    tagsInput,
    fieldMapping,
    summaryVisible,
  } = storeToRefs(batchStore);

  const tags = computed(() =>
    tagsInput.value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );

  const statusSummary = computed(() => summarizeBatchStatuses(items.value));
  const modelCss = ref<string | null>(null);
  const hasActiveTask = computed(() => items.value.length > 0);
  const isRunning = computed(
    () => progress.value.phase === 'check' || progress.value.phase === 'import'
  );
  const canEditConfig = computed(() => !configLocked.value && !isRunning.value && !busy.value);
  const canCancel = computed(() => isRunning.value && busy.value);

  const setItem = (key: string, patch: Partial<BatchAnkiExportItem>): void => {
    items.value = items.value.map(item => (item.key === key ? { ...item, ...patch } : item));
  };

  const normalizeExportFileName = (value: string): string => {
    const normalized = value.replace(/^.*[\\/]/, '').trim();
    if (!normalized) return 'ad-fontes-export.apkg';
    return normalized.toLowerCase().endsWith('.apkg') ? normalized : `${normalized}.apkg`;
  };

  const resetCheckState = (): void => {
    items.value = items.value.map(item => ({
      ...item,
      payload: null,
      preflightDuplicateState: null,
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
      templateName: templateName.value,
      tags: tags.value,
    });
  };

  const loadModelMetadata = async (): Promise<void> => {
    if (!ankiConnected.value || !modelName.value.trim()) {
      modelFieldNames.value = [];
      templateOptions.value = [];
      modelCss.value = null;
      templateName.value = '';
      fieldMapping.value = [];
      return;
    }

    modelCss.value = null;
    const [fields, templates, css] = await Promise.all([
      getModelFieldNames(modelName.value),
      getModelTemplates(modelName.value),
      getModelStyling(modelName.value),
    ]);
    modelFieldNames.value = fields;
    templateOptions.value = templates;
    modelCss.value = css;
    fieldMapping.value = hasStoredFieldMapping(modelName.value)
      ? loadFieldMapping(modelName.value)
      : getRecommendedMapping(fields);
    if (!hasStoredFieldMapping(modelName.value)) {
      saveFieldMapping(modelName.value, fieldMapping.value);
    }

    const hasSelectedTemplate = templates.some(template => template.name === templateName.value);
    if (!hasSelectedTemplate) {
      templateName.value = templates[0]?.name || '';
    }
    persistOptions();
  };

  const connectAnki = async (force = false): Promise<void> => {
    if (
      !force &&
      ankiConnected.value &&
      deckOptions.value.length > 0 &&
      modelOptions.value.length > 0
    ) {
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
      await loadModelMetadata();
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
    cancelRequested.value = false;
    canResume.value = false;
    lastStoppedPhase.value = null;
    items.value = records.map(record => ({
      key: makeWordSelectionKey(record),
      id: String(record.id),
      lemma: String(record.lemma || record.yield?.lemma || record.lemma_preview || record.id),
      record,
      payload: null,
      preflightDuplicateState: null,
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
    } else {
      try {
        await loadModelMetadata();
      } catch {
        // Keep modal open and let user retry connect manually.
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
    cancelRequested.value = false;
    canResume.value = false;
  };

  const cancelBatchOperation = (): void => {
    cancelRequested.value = true;
    summaryVisible.value = true;
  };

  const stopBatchOperation = (
    phase: 'check' | 'import',
    cancellableStatuses: Array<BatchAnkiExportItem['status']>
  ): void => {
    items.value = markPendingItemsCancelled(items.value, cancellableStatuses);
    canResume.value = true;
    lastStoppedPhase.value = phase;
    cancelRequested.value = false;
    summaryVisible.value = true;
    error.value = `Batch ${phase} cancelled by user`;
  };

  const reviveCancelledItemsForResume = (phase: 'check' | 'import'): void => {
    items.value = items.value.map(item => {
      if (item.status !== 'cancelled') return item;
      if (phase === 'check') {
        return {
          ...item,
          status: 'pending',
        };
      }

      return {
        ...item,
        status: item.conflict ? 'duplicate' : 'ready',
      };
    });
  };

  const checkDuplicates = async (): Promise<void> => {
    const checkTargets = items.value.filter(
      item => item.status === 'pending' || item.status === 'cancelled'
    );
    if (!checkTargets.length) return;
    busy.value = true;
    error.value = '';
    summaryVisible.value = true;
    markTaskStarted();
    lastStoppedPhase.value = null;
    progress.value = createBatchProgress('check', checkTargets.length);

    try {
      if (!ankiConnected.value) await connectAnki(true);

      for (const item of checkTargets) {
        if (cancelRequested.value) {
          stopBatchOperation('check', ['pending', 'cancelled']);
          break;
        }

        setItem(item.key, {
          status: 'checking',
          error: '',
        });

        try {
          const payload = await buildExportPayload(
            item.record,
            {
              deckName: deckName.value,
              modelName: modelName.value,
              tags: tags.value,
            },
            fieldMapping.value
          );
          const conflict = await checkDuplicateConflict(payload);
          if (conflict) {
            setItem(item.key, {
              payload,
              preflightDuplicateState: 'duplicate',
              conflict,
              resolution: 'undecided',
              status: 'duplicate',
            });
          } else {
            setItem(item.key, {
              payload,
              preflightDuplicateState: 'ready',
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

        if (cancelRequested.value) {
          stopBatchOperation('check', ['pending', 'cancelled']);
          break;
        }
      }

      if (!canResume.value) {
        lastStoppedPhase.value = null;
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

  const exportApkg = async (): Promise<void> => {
    if (!items.value.length) {
      throw new Error('No selected words for .apkg export');
    }

    busy.value = true;
    error.value = '';
    summaryVisible.value = true;

    try {
      if (!ankiConnected.value) {
        throw new Error(
          'Anki is not connected. Please connect Anki to load model fields/templates.'
        );
      }
      if (!modelFieldNames.value.length) {
        throw new Error('No model fields loaded for selected model. Please refresh Anki data.');
      }
      if (modelCss.value === null) {
        throw new Error('Model CSS is not loaded. Please connect Anki before exporting .apkg.');
      }
      const selectedTemplate: AnkiModelTemplate | undefined = templateOptions.value.find(
        template => template.name === templateName.value
      );
      if (!selectedTemplate) {
        throw new Error('Please select a card template for .apkg export.');
      }

      const outputFileName = normalizeExportFileName(
        `${deckName.value || 'ad-fontes-export'}-batch.apkg`
      );

      if (items.value.length > BACKEND_BY_IDS_EXPORT_THRESHOLD) {
        await exportApkgByIds(
          items.value.map(item => item.id),
          fieldMapping.value,
          {
            deckName: deckName.value,
            modelName: modelName.value,
            tags: tags.value,
          },
          modelFieldNames.value,
          selectedTemplate,
          modelCss.value,
          outputFileName
        );
        return;
      }

      const payloads = await Promise.all(
        items.value.map(async item => {
          if (item.payload) return item.payload;
          return buildExportPayload(
            item.record,
            {
              deckName: deckName.value,
              modelName: modelName.value,
              tags: tags.value,
            },
            fieldMapping.value
          );
        })
      );

      await exportBatchApkgViaAnkiConnect(
        payloads,
        outputFileName,
        modelFieldNames.value,
        selectedTemplate,
        modelCss.value
      );
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Batch .apkg export failed';
      throw err;
    } finally {
      busy.value = false;
    }
  };

  const importReadyItems = async (): Promise<void> => {
    const importable = getImportableBatchItems(items.value);
    if (!importable.length) return;

    busy.value = true;
    error.value = '';
    summaryVisible.value = true;
    markTaskStarted();
    lastStoppedPhase.value = null;
    progress.value = createBatchProgress('import', importable.length);

    try {
      if (!ankiConnected.value) await connectAnki(true);

      for (const item of importable) {
        if (cancelRequested.value) {
          stopBatchOperation('import', ['ready', 'duplicate', 'cancelled']);
          break;
        }

        setItem(item.key, {
          status: 'importing',
          error: '',
        });
        try {
          if (!item.payload) {
            throw new Error('Payload not prepared; please run duplicate check first.');
          }
          if (item.preflightDuplicateState === 'duplicate' && item.resolution === 'skip') {
            setItem(item.key, {
              status: 'skipped',
            });
            continue;
          }

          if (item.preflightDuplicateState === 'duplicate' && item.resolution === 'overwrite') {
            const result = await importPayloadWithStrategy(
              item.payload,
              'overwrite_if_duplicate',
              'duplicate'
            );
            setItem(item.key, {
              status: result.mode === 'overwritten' ? 'overwritten' : 'imported',
              noteId: result.noteId,
            });
            continue;
          }

          if (item.preflightDuplicateState === 'ready') {
            const result = await importPayloadWithStrategy(
              item.payload,
              'add_if_not_duplicate',
              'ready'
            );
            setItem(item.key, {
              status: result.mode === 'overwritten' ? 'overwritten' : 'imported',
              noteId: result.noteId,
            });
            continue;
          }

          if (item.preflightDuplicateState === 'duplicate' && item.resolution === 'undecided') {
            throw new Error('Duplicate item is unresolved; choose skip or overwrite first.');
          } else {
            throw new Error(
              'Item duplicate preflight status is missing; run duplicate check first.'
            );
          }
        } catch (err) {
          if (isAnkiDuplicateConflictError(err)) {
            setItem(item.key, {
              status: 'duplicate',
              preflightDuplicateState: 'duplicate',
              conflict: err.conflict,
              resolution: 'undecided',
              error: '',
            });
          } else {
            const e = err as { message?: string };
            setItem(item.key, {
              status: 'failed',
              error: e.message || 'Import failed',
            });
          }
        }

        progress.value = stepBatchProgress(progress.value);

        if (cancelRequested.value) {
          stopBatchOperation('import', ['ready', 'duplicate', 'cancelled']);
          break;
        }
      }

      if (!canResume.value) {
        lastStoppedPhase.value = null;
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

  const updateFieldMapping = (mapping: FieldMappingConfig): void => {
    fieldMapping.value = mapping;
    saveFieldMapping(modelName.value, mapping);
    if (!isOpen.value || configLocked.value) return;
    resetCheckState();
  };

  watch([deckName, tagsInput], () => {
    persistOptions();
    if (!isOpen.value || configLocked.value) return;
    resetCheckState();
  });

  watch(modelName, () => {
    persistOptions();
    if (!ankiConnected.value) {
      modelFieldNames.value = [];
      templateOptions.value = [];
      modelCss.value = null;
      templateName.value = '';
      fieldMapping.value = [];
      return;
    }
    void loadModelMetadata().catch(err => {
      const e = err as { message?: string };
      error.value = e.message || 'Failed to load model template metadata';
    });
    if (!isOpen.value || configLocked.value) return;
    resetCheckState();
  });

  watch(templateName, () => {
    persistOptions();
  });

  const progressLabel = computed(() => {
    const phase = progress.value.phase as BatchAnkiProgressPhase;
    if (phase === 'check')
      return `Checking duplicates ${progress.value.processed}/${progress.value.total}`;
    if (phase === 'import')
      return `Importing to Anki ${progress.value.processed}/${progress.value.total}`;
    return '';
  });

  const resumeBatchOperation = async (): Promise<void> => {
    if (!canResume.value || !lastStoppedPhase.value) return;
    if (lastStoppedPhase.value === 'check') {
      reviveCancelledItemsForResume('check');
      await checkDuplicates();
      return;
    }
    reviveCancelledItemsForResume('import');
    await importReadyItems();
  };

  const restartBatchOperation = (): void => {
    cancelRequested.value = false;
    canResume.value = false;
    lastStoppedPhase.value = null;
    error.value = '';
    summaryVisible.value = true;
    resetCheckState();
    configLocked.value = false;
    taskStarted.value = false;
    progress.value = createBatchProgress('idle', 0);
  };

  const stageLabel = computed(() => {
    if (progress.value.phase === 'check') return 'Checking';
    if (progress.value.phase === 'import') return 'Importing';
    if (busy.value) return 'Running';
    if (hasActiveTask.value) return 'Idle';
    return 'Idle';
  });

  if (
    ankiSessionCache.connected &&
    deckOptions.value.length === 0 &&
    modelOptions.value.length === 0
  ) {
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
    templateName,
    tagsInput,
    fieldMapping,
    ankiConnected,
    deckOptions,
    modelOptions,
    modelFieldNames,
    templateOptions,
    modelCss,
    progress,
    progressLabel,
    stageLabel,
    statusSummary,
    hasActiveTask,
    canEditConfig,
    canCancel,
    canResume,
    cancelRequested,
    lastStoppedPhase,
    summaryVisible,
    open,
    close,
    reopenPanel,
    dismissSummary,
    connectAnki,
    updateFieldMapping,
    cancelBatchOperation,
    checkDuplicates,
    setDuplicatesResolutionAll,
    exportApkg,
    importReadyItems,
    resumeBatchOperation,
    restartBatchOperation,
  };
};
