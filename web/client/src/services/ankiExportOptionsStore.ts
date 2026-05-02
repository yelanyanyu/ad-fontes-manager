import { getDefaultAnkiOptions } from '@/services/ankiExportService';

export const ANKI_OPTIONS_STORAGE_KEY = 'adfontes.anki.export.options';

export interface StoredAnkiExportOptions {
  deckName?: string;
  modelName?: string;
  templateName?: string;
  tags?: string[];
  apkgPath?: string;
}

export const loadStoredAnkiExportOptions = (): StoredAnkiExportOptions => {
  try {
    const raw = localStorage.getItem(ANKI_OPTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAnkiExportOptions;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStoredAnkiExportOptions = (options: StoredAnkiExportOptions): void => {
  localStorage.setItem(ANKI_OPTIONS_STORAGE_KEY, JSON.stringify(options));
};

export const getInitialAnkiExportOptions = () => {
  const defaults = getDefaultAnkiOptions();
  const stored = loadStoredAnkiExportOptions();

  return {
    deckName: stored.deckName || defaults.deckName,
    modelName: stored.modelName || defaults.modelName,
    templateName: stored.templateName || '',
    tagsInput: (stored.tags || defaults.tags).join(', '),
    apkgPath: stored.apkgPath || 'ad-fontes-export.apkg',
  };
};
