import type {
  AnkiDataSource,
  FieldMappingConfig,
  FieldMappingEntry,
  LegacyFieldMappingConfig,
} from '@/types/anki';

const STORAGE_KEY = 'anki_field_mappings';

export const ANKI_DATA_SOURCE_OPTIONS: Array<{ id: AnkiDataSource; label: string }> = [
  { id: 'lemma', label: 'Lemma' },
  { id: 'user_context_sentence', label: 'User context sentence' },
  { id: 'other_common_meanings', label: 'Other common meanings' },
  { id: 'selected_examples_sentence', label: 'Selected examples: sentence' },
  { id: 'selected_examples_translation', label: 'Selected examples: translation' },
  { id: 'synonyms_word', label: 'Synonyms: word' },
  { id: 'synonyms_meaning', label: 'Synonyms: meaning' },
  { id: 'rendered_html', label: 'Rendered card HTML' },
];

const DATA_SOURCE_IDS = new Set<AnkiDataSource>(ANKI_DATA_SOURCE_OPTIONS.map(option => option.id));

const LEGACY_RECOMMENDED_MAPPING: LegacyFieldMappingConfig = {
  lemma: 'Word',
  user_context_sentence: 'Context',
  rendered_html: 'Back',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isAnkiDataSource = (value: unknown): value is AnkiDataSource =>
  typeof value === 'string' && DATA_SOURCE_IDS.has(value as AnkiDataSource);

const normalizeEntry = (entry: unknown): FieldMappingEntry | null => {
  if (!isRecord(entry) || !isAnkiDataSource(entry.source) || typeof entry.target !== 'string') {
    return null;
  }
  const target = entry.target.trim();
  return target ? { source: entry.source, target } : null;
};

const normalizeMapping = (value: unknown): FieldMappingConfig => {
  if (Array.isArray(value)) {
    return value.flatMap(entry => {
      const normalized = normalizeEntry(entry);
      return normalized ? [normalized] : [];
    });
  }

  if (!isRecord(value)) return [];

  return Object.entries(value).flatMap(([source, target]) => {
    if (!isAnkiDataSource(source) || typeof target !== 'string' || !target.trim()) return [];
    return [{ source, target: target.trim() }];
  });
};

const loadAllMappings = (): Record<string, FieldMappingConfig> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([modelName, mapping]) => [modelName, normalizeMapping(mapping)])
    );
  } catch {
    return {};
  }
};

const saveAllMappings = (mappings: Record<string, FieldMappingConfig>): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
};

export const loadFieldMapping = (modelName: string): FieldMappingConfig => {
  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) return [];
  return loadAllMappings()[normalizedModelName] || [];
};

export const hasStoredFieldMapping = (modelName: string): boolean => {
  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) return false;
  return Object.prototype.hasOwnProperty.call(loadAllMappings(), normalizedModelName);
};

export const listStoredFieldMappingModelNames = (): string[] =>
  Object.entries(loadAllMappings())
    .filter(([modelName, mapping]) => modelName.trim() && mapping.length > 0)
    .map(([modelName]) => modelName)
    .sort((a, b) => a.localeCompare(b));

export const saveFieldMapping = (modelName: string, mapping: FieldMappingConfig): void => {
  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) return;
  const mappings = loadAllMappings();
  mappings[normalizedModelName] = normalizeMapping(mapping);
  saveAllMappings(mappings);
};

export const getRecommendedMapping = (modelFieldNames: string[]): FieldMappingConfig => {
  const fieldSet = new Set(modelFieldNames);
  return Object.entries(LEGACY_RECOMMENDED_MAPPING).flatMap(([source, target]) => {
    if (!isAnkiDataSource(source) || !fieldSet.has(target)) return [];
    return [{ source, target }];
  });
};

export const removeFieldMapping = (modelName: string): void => {
  const normalizedModelName = modelName.trim();
  if (!normalizedModelName) return;
  const mappings = loadAllMappings();
  delete mappings[normalizedModelName];
  saveAllMappings(mappings);
};
