import { computed, ref, watch } from 'vue';
import { getDefaultAnkiOptions } from '@/services/ankiExportService';
import { buildExportPayload } from '@/services/ankiPayloadBuilder';
import {
  getInitialAnkiExportOptions,
  saveStoredAnkiExportOptions,
} from '@/services/ankiExportOptionsStore';
import {
  applyDuplicateResolution,
  getDeckNames,
  getModelNames,
  importPayloadWithStrategy,
  isAnkiDuplicateConflictError,
  pingAnkiConnect,
} from '@/services/ankiConnectService';
import { exportApkgViaAnkiConnect } from '@/services/apkgExportService';
import type {
  AnkiConflictAction,
  AnkiDuplicateConflict,
  AnkiExportPayload,
  AnkiImportResult,
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

export const useAnkiExport = () => {
  const isOpen = ref(false);
  const busy = ref(false);
  const error = ref('');
  const payload = ref<AnkiExportPayload | null>(null);
  const duplicateConflict = ref<AnkiDuplicateConflict | null>(null);
  const currentRecord = ref<WordRecord | null>(null);
  const deckOptions = ref<string[]>([...ankiSessionCache.deckOptions]);
  const modelOptions = ref<string[]>([...ankiSessionCache.modelOptions]);
  const ankiConnected = ref(ankiSessionCache.connected);

  const defaults = getDefaultAnkiOptions();
  const initialOptions = getInitialAnkiExportOptions();
  const deckName = ref(initialOptions.deckName || defaults.deckName);
  const modelName = ref(initialOptions.modelName || defaults.modelName);
  const addReverse = ref(
    typeof initialOptions.addReverse === 'boolean' ? initialOptions.addReverse : defaults.addReverse
  );
  const tagsInput = ref(initialOptions.tagsInput || defaults.tags.join(', '));
  const apkgPath = ref(
    initialOptions.apkgPath || 'C:\\Users\\lenovo\\Downloads\\ad-fontes-test.apkg'
  );

  const tags = computed(() =>
    tagsInput.value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );

  const persistOptions = (): void => {
    saveStoredAnkiExportOptions({
      deckName: deckName.value,
      modelName: modelName.value,
      addReverse: addReverse.value,
      tags: tags.value,
      apkgPath: apkgPath.value,
    });
  };

  const syncPayloadOptions = (): void => {
    if (!payload.value) return;
    payload.value = {
      ...payload.value,
      fields: {
        ...payload.value.fields,
        'Add Reverse': addReverse.value ? 'yes' : '',
      },
      options: {
        ...payload.value.options,
        deckName: deckName.value,
        modelName: modelName.value,
        addReverse: addReverse.value,
        tags: tags.value,
      },
    };
  };

  const refreshPayload = async (): Promise<void> => {
    if (!currentRecord.value) return;
    payload.value = await buildExportPayload(currentRecord.value, {
      deckName: deckName.value,
      modelName: modelName.value,
      addReverse: addReverse.value,
      tags: tags.value,
    });
  };

  const normalizeExportFileName = (value: string): string => {
    const normalized = value.replace(/^.*[\\/]/, '').trim();
    if (!normalized) return 'ad-fontes-export.apkg';
    return normalized.toLowerCase().endsWith('.apkg') ? normalized : `${normalized}.apkg`;
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

    busy.value = true;
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
      await refreshPayload();
    } catch (err) {
      const e = err as { message?: string };
      ankiConnected.value = false;
      ankiSessionCache.connected = false;
      error.value = e.message || 'Failed to connect to AnkiConnect';
      throw err;
    } finally {
      busy.value = false;
    }
  };

  const browseApkgPath = async (): Promise<void> => {
    const globalWindow = window as typeof window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<{ name: string }>;
    };

    if (!globalWindow.showSaveFilePicker) {
      error.value =
        'Current browser does not support file save picker; please input file name manually.';
      return;
    }

    try {
      const handle = await globalWindow.showSaveFilePicker({
        suggestedName: normalizeExportFileName(apkgPath.value || `${deckName.value}.apkg`),
        types: [
          {
            description: 'Anki Package',
            accept: {
              'application/octet-stream': ['.apkg'],
            },
          },
        ],
      });
      apkgPath.value = handle.name;
      persistOptions();
    } catch {
      // User canceled picker.
    }
  };

  const open = async (record: WordRecord): Promise<void> => {
    isOpen.value = true;
    busy.value = true;
    error.value = '';
    currentRecord.value = record;

    try {
      if (!ankiConnected.value) {
        await connectAnki();
      }
      await refreshPayload();
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Failed to build export payload';
      payload.value = null;
    } finally {
      busy.value = false;
    }
  };

  const close = (): void => {
    isOpen.value = false;
    error.value = '';
    duplicateConflict.value = null;
  };

  const updateAndRefresh = async (): Promise<void> => {
    persistOptions();
    if (!currentRecord.value) return;
    busy.value = true;
    error.value = '';
    try {
      await refreshPayload();
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Failed to refresh export payload';
    } finally {
      busy.value = false;
    }
  };

  const importToAnki = async (): Promise<AnkiImportResult> => {
    if (!payload.value) {
      throw new Error('Export payload is not ready');
    }
    busy.value = true;
    error.value = '';
    try {
      const version = await pingAnkiConnect();
      if (!version) {
        throw new Error('AnkiConnect version check failed');
      }
      const result = await importPayloadWithStrategy(payload.value, 'overwrite_if_duplicate');
      if (result.mode === 'overwritten') {
        return { status: 'overwritten', noteId: result.noteId };
      }

      return { status: 'imported', noteId: result.noteId };
    } catch (err) {
      if (isAnkiDuplicateConflictError(err)) {
        duplicateConflict.value = err.conflict;
        return { status: 'conflict', conflict: err.conflict };
      }

      const e = err as { message?: string };
      error.value = e.message || 'Failed to import note to Anki';
      throw err;
    } finally {
      busy.value = false;
    }
  };

  const resolveDuplicateConflict = async (
    action: AnkiConflictAction
  ): Promise<AnkiImportResult> => {
    if (!payload.value || !duplicateConflict.value) {
      throw new Error('No duplicate conflict to resolve');
    }

    busy.value = true;
    error.value = '';
    try {
      const result = await applyDuplicateResolution(payload.value, duplicateConflict.value, action);
      const conflictSnapshot = duplicateConflict.value;
      duplicateConflict.value = null;

      if ('skipped' in result) {
        return { status: 'skipped' };
      }

      return { status: 'imported', noteId: result.noteId ?? conflictSnapshot.noteId };
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Failed to resolve duplicate conflict';
      throw err;
    } finally {
      busy.value = false;
    }
  };

  const exportApkg = async (): Promise<void> => {
    if (!payload.value) {
      throw new Error('Export payload is not ready');
    }
    busy.value = true;
    error.value = '';
    try {
      await exportApkgViaAnkiConnect(payload.value, normalizeExportFileName(apkgPath.value));
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Failed to export .apkg';
      throw err;
    } finally {
      busy.value = false;
    }
  };

  watch([deckName, modelName, addReverse, tagsInput], () => {
    persistOptions();
    syncPayloadOptions();
  });

  watch(apkgPath, () => {
    persistOptions();
  });

  return {
    isOpen,
    busy,
    error,
    payload,
    duplicateConflict,
    ankiConnected,
    deckOptions,
    modelOptions,
    deckName,
    modelName,
    addReverse,
    tagsInput,
    apkgPath,
    open,
    close,
    connectAnki,
    browseApkgPath,
    updateAndRefresh,
    importToAnki,
    resolveDuplicateConflict,
    exportApkg,
  };
};
