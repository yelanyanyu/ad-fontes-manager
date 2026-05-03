import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANKI_OPTIONS_STORAGE_KEY,
  getStoredAnkiExportOptionsSummary,
  hasStoredAnkiExportOptions,
  saveStoredAnkiExportOptions,
} from '@/services/ankiExportOptionsStore';

describe('ankiExportOptionsStore', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
    });
  });

  it('detects when Anki export options were saved', () => {
    expect(hasStoredAnkiExportOptions()).toBe(false);

    saveStoredAnkiExportOptions({
      deckName: 'Latin',
      modelName: 'Ad Fontes',
      templateName: 'Forward',
      tags: ['latin', 'reading'],
      apkgPath: 'latin.apkg',
    });

    expect(hasStoredAnkiExportOptions()).toBe(true);
  });

  it('returns a display summary for saved Anki export options', () => {
    localStorage.setItem(
      ANKI_OPTIONS_STORAGE_KEY,
      JSON.stringify({
        deckName: 'Greek',
        modelName: 'Ad Fontes Cloze',
        templateName: 'Recognition',
        tags: ['greek', 'review'],
        apkgPath: 'greek.apkg',
      })
    );

    expect(getStoredAnkiExportOptionsSummary()).toEqual({
      deckName: 'Greek',
      modelName: 'Ad Fontes Cloze',
      templateName: 'Recognition',
      tagsText: 'greek, review',
      apkgPath: 'greek.apkg',
    });
  });
});
