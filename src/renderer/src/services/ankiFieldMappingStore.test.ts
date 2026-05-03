import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listStoredFieldMappingModelNames,
  saveFieldMapping,
} from '@/services/ankiFieldMappingStore';

describe('ankiFieldMappingStore', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
    });
  });

  it('lists model names that have saved field mappings', () => {
    expect(listStoredFieldMappingModelNames()).toEqual([]);

    saveFieldMapping('Basic', [{ source: 'lemma', target: 'Front' }]);
    saveFieldMapping('Ad Fontes', [{ source: 'rendered_html', target: 'Back' }]);

    expect(listStoredFieldMappingModelNames()).toEqual(['Ad Fontes', 'Basic']);
  });
});
