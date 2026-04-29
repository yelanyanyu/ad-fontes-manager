import { computed, ref, watch } from 'vue';
import { getDefaultAnkiOptions } from '@/services/ankiExportService';
import { buildExportPayload } from '@/services/ankiPayloadBuilder';
import {
  getInitialAnkiExportOptions,
  saveStoredAnkiExportOptions,
} from '@/services/ankiExportOptionsStore';
import {
  checkDuplicateConflict,
  getDeckNames,
  getModelFieldNames,
  getModelNames,
  getModelTemplates,
  importPayloadWithStrategy,
  isAnkiDuplicateConflictError,
  isAnkiImportStateMismatchError,
  pingAnkiConnect,
} from '@/services/ankiConnectService';
import { exportApkgViaAnkiConnect } from '@/services/apkgExportService';
import type {
  AnkiDuplicateConflict,
  AnkiDuplicateState,
  AnkiExportPayload,
  AnkiImportResult,
  AnkiModelTemplate,
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
  const duplicateState = ref<AnkiDuplicateState | null>(null);
  const currentRecord = ref<WordRecord | null>(null);
  const deckOptions = ref<string[]>([...ankiSessionCache.deckOptions]);
  const modelOptions = ref<string[]>([...ankiSessionCache.modelOptions]);
  const ankiConnected = ref(ankiSessionCache.connected);

  const defaults = getDefaultAnkiOptions();
  const initialOptions = getInitialAnkiExportOptions();
  const deckName = ref(initialOptions.deckName || defaults.deckName);
  const modelName = ref(initialOptions.modelName || defaults.modelName);
  const templateName = ref(initialOptions.templateName || '');
  const addReverse = ref(
    typeof initialOptions.addReverse === 'boolean' ? initialOptions.addReverse : defaults.addReverse
  );
  const tagsInput = ref(initialOptions.tagsInput || defaults.tags.join(', '));
  const apkgPath = ref(
    initialOptions.apkgPath || 'ad-fontes-export.apkg'
  );
  const modelFieldNames = ref<string[]>([]);
  const templateOptions = ref<AnkiModelTemplate[]>([]);

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
      templateName: templateName.value,
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

  const loadModelMetadata = async (): Promise<void> => {
    if (!ankiConnected.value || !modelName.value.trim()) {
      modelFieldNames.value = [];
      templateOptions.value = [];
      templateName.value = '';
      return;
    }

    const [fields, templates] = await Promise.all([
      getModelFieldNames(modelName.value),
      getModelTemplates(modelName.value),
    ]);
    modelFieldNames.value = fields;
    templateOptions.value = templates;

    const hasSelectedTemplate = templates.some(template => template.name === templateName.value);
    if (!hasSelectedTemplate) {
      templateName.value = templates[0]?.name || '';
    }
    persistOptions();
  };

  const refreshDuplicateState = async (): Promise<void> => {
    if (!payload.value) {
      duplicateConflict.value = null;
      duplicateState.value = null;
      return;
    }

    const conflict = await checkDuplicateConflict(payload.value);
    duplicateConflict.value = conflict;
    duplicateState.value = conflict ? 'duplicate' : 'ready';
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
      await loadModelMetadata();
      persistOptions();
      await refreshPayload();
      await refreshDuplicateState();
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
        try {
          await connectAnki();
        } catch {
          // Continue with local payload preview and .apkg export without AnkiConnect.
        }
      }

      await refreshPayload();
      if (ankiConnected.value) {
        await loadModelMetadata();
        await refreshDuplicateState();
      } else {
        duplicateConflict.value = null;
        duplicateState.value = null;
      }
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
    duplicateState.value = null;
  };

  const updateAndRefresh = async (): Promise<void> => {
    persistOptions();
    if (!currentRecord.value) return;
    busy.value = true;
    error.value = '';
    try {
      await refreshPayload();
      if (ankiConnected.value) {
        await loadModelMetadata();
        await refreshDuplicateState();
      } else {
        duplicateConflict.value = null;
        duplicateState.value = null;
      }
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
    const payloadSnapshot = payload.value;

    busy.value = true;
    error.value = '';
    try {
      const version = await pingAnkiConnect();
      if (!version) {
        throw new Error('AnkiConnect version check failed');
      }
      if (!duplicateState.value) {
        throw new Error('Duplicate status is not ready, please refresh preview first.');
      }

      const strategy =
        duplicateState.value === 'duplicate' ? 'overwrite_if_duplicate' : 'add_if_not_duplicate';
      const result = await importPayloadWithStrategy(
        payloadSnapshot,
        strategy,
        duplicateState.value
      );
      if (result.mode === 'overwritten') {
        duplicateConflict.value = null;
        duplicateState.value = 'ready';
        return { status: 'overwritten', noteId: result.noteId };
      }

      duplicateConflict.value = null;
      duplicateState.value = 'ready';
      return { status: 'imported', noteId: result.noteId };
    } catch (err) {
      if (isAnkiDuplicateConflictError(err)) {
        duplicateConflict.value = err.conflict;
        duplicateState.value = 'duplicate';
        return { status: 'conflict', conflict: err.conflict };
      }

      if (isAnkiImportStateMismatchError(err)) {
        duplicateState.value = err.actualState;
        duplicateConflict.value = await checkDuplicateConflict(payloadSnapshot);
      }

      const e = err as { message?: string };
      error.value = e.message || 'Failed to import note to Anki';
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
      if (!ankiConnected.value) {
        throw new Error('Anki is not connected. Please connect Anki to load model fields/templates.');
      }
      if (!modelFieldNames.value.length) {
        throw new Error('No model fields loaded for selected model. Please refresh Anki data.');
      }
      const selectedTemplate = templateOptions.value.find(
        template => template.name === templateName.value
      );
      if (!selectedTemplate) {
        throw new Error('Please select a card template for .apkg export.');
      }
      await exportApkgViaAnkiConnect(
        payload.value,
        normalizeExportFileName(apkgPath.value),
        modelFieldNames.value,
        selectedTemplate
      );
    } catch (err) {
      const e = err as { message?: string };
      error.value = e.message || 'Failed to export .apkg';
      throw err;
    } finally {
      busy.value = false;
    }
  };

  watch([deckName, addReverse, tagsInput], () => {
    persistOptions();
    syncPayloadOptions();
    duplicateConflict.value = null;
    duplicateState.value = null;
  });

  watch(modelName, () => {
    persistOptions();
    syncPayloadOptions();
    duplicateConflict.value = null;
    duplicateState.value = null;
    if (!ankiConnected.value) {
      modelFieldNames.value = [];
      templateOptions.value = [];
      templateName.value = '';
      return;
    }
    void loadModelMetadata().catch(err => {
      const e = err as { message?: string };
      error.value = e.message || 'Failed to load model template metadata';
    });
  });

  watch(apkgPath, () => {
    persistOptions();
  });

  watch(templateName, () => {
    persistOptions();
  });

  return {
    isOpen,
    busy,
    error,
    payload,
    duplicateConflict,
    duplicateState,
    ankiConnected,
    deckOptions,
    modelOptions,
    deckName,
    modelName,
    templateName,
    addReverse,
    tagsInput,
    apkgPath,
    modelFieldNames,
    templateOptions,
    open,
    close,
    connectAnki,
    browseApkgPath,
    updateAndRefresh,
    importToAnki,
    exportApkg,
  };
};
