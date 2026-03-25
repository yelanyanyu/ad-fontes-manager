import { computed, ref, watch } from 'vue';
import yaml from 'js-yaml';
import request from '@/utils/request';
import { createAnkiPayload, getDefaultAnkiOptions } from '@/services/ankiExportService';
import {
  getDeckNames,
  getModelNames,
  importPayloadToAnki,
  pingAnkiConnect,
} from '@/services/ankiConnectService';
import { exportApkgViaAnkiConnect } from '@/services/apkgExportService';
import type { AnkiExportPayload, ParsedWordSource } from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

type UnknownRecord = Record<string, unknown>;

const STORAGE_KEY = 'adfontes.anki.export.options';

interface StoredOptions {
  deckName?: string;
  modelName?: string;
  addReverse?: boolean;
  tags?: string[];
  apkgPath?: string;
}

const parseYamlData = (source: unknown): UnknownRecord | null => {
  if (!source) return null;
  if (typeof source === 'string') {
    const parsed = yaml.load(source);
    return parsed && typeof parsed === 'object' ? (parsed as UnknownRecord) : null;
  }
  if (typeof source === 'object') {
    return source as UnknownRecord;
  }
  return null;
};

const loadStoredOptions = (): StoredOptions => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredOptions;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveStoredOptions = (options: StoredOptions): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
};

export const useAnkiExport = () => {
  const isOpen = ref(false);
  const busy = ref(false);
  const error = ref('');
  const payload = ref<AnkiExportPayload | null>(null);
  const currentRecord = ref<WordRecord | null>(null);
  const deckOptions = ref<string[]>([]);
  const modelOptions = ref<string[]>([]);
  const ankiConnected = ref(false);

  const defaults = getDefaultAnkiOptions();
  const stored = loadStoredOptions();

  const deckName = ref(stored.deckName || defaults.deckName);
  const modelName = ref(stored.modelName || defaults.modelName);
  const addReverse = ref(
    typeof stored.addReverse === 'boolean' ? stored.addReverse : defaults.addReverse
  );
  const tagsInput = ref((stored.tags || defaults.tags).join(', '));
  const apkgPath = ref(stored.apkgPath || 'C:\\Users\\lenovo\\Downloads\\ad-fontes-test.apkg');

  const tags = computed(() =>
    tagsInput.value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  );

  const persistOptions = (): void => {
    saveStoredOptions({
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

  const resolveParsedSource = async (record: WordRecord): Promise<ParsedWordSource> => {
    const localData = parseYamlData(record.original_yaml || record.raw_yaml);
    if (localData) {
      return {
        id: String(record.id),
        record,
        data: localData,
      };
    }

    const full = await request.get<{ original_yaml?: unknown }>(
      `/words/${encodeURIComponent(record.id)}`,
      {
        skipErrorToast: true,
      }
    );
    const fetched = parseYamlData(full?.original_yaml);
    if (!fetched) {
      throw new Error('Failed to resolve YAML source for export');
    }

    return {
      id: String(record.id),
      record,
      data: fetched,
    };
  };

  const refreshPayload = async (): Promise<void> => {
    if (!currentRecord.value) return;
    const source = await resolveParsedSource(currentRecord.value);
    payload.value = createAnkiPayload(source, {
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

  const connectAnki = async (): Promise<void> => {
    busy.value = true;
    error.value = '';
    try {
      await pingAnkiConnect();
      const [decks, models] = await Promise.all([getDeckNames(), getModelNames()]);
      deckOptions.value = decks;
      modelOptions.value = models;
      ankiConnected.value = true;

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
      error.value = 'Current browser does not support file save picker; please input file name manually.';
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
      await connectAnki();
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

  const importToAnki = async (): Promise<{ noteId: number }> => {
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
      const result = await importPayloadToAnki(payload.value);
      return result;
    } catch (err) {
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
    exportApkg,
  };
};
