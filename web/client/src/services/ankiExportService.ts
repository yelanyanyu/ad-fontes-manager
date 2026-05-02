import type {
  AnkiExportOptions,
  AnkiExportPayload,
  FieldMappingConfig,
  ParsedWordSource,
} from '@/types/anki';
import { buildAnkiFields, extractLemma } from '@/services/ankiFieldMapper';

const DEFAULT_OPTIONS: AnkiExportOptions = {
  deckName: 'test',
  modelName: 'AdFontesWord',
  tags: [],
};

export const getDefaultAnkiOptions = (): AnkiExportOptions => ({ ...DEFAULT_OPTIONS });

export const createAnkiPayload = (
  source: ParsedWordSource,
  options: Partial<AnkiExportOptions> = {},
  fieldMapping: FieldMappingConfig = []
): AnkiExportPayload => {
  const finalOptions: AnkiExportOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    tags: Array.isArray(options.tags) ? options.tags : DEFAULT_OPTIONS.tags,
  };

  const fields = buildAnkiFields(source.data, fieldMapping);
  const sourceLemma =
    extractLemma(source.data) || source.record.lemma || source.record.lemma_preview || source.id;

  return {
    fields,
    options: finalOptions,
    sourceWordId: source.id,
    sourceLemma,
    fieldMapping,
  };
};
