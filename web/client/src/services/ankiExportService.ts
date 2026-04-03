import type { AnkiExportOptions, AnkiExportPayload, ParsedWordSource } from '@/types/anki';
import { DEFAULT_ANKI_FIELD_MAPPING, mapWordToAnkiFields } from '@/services/ankiFieldMapper';

const DEFAULT_OPTIONS: AnkiExportOptions = {
  deckName: 'test',
  modelName: 'AdFontesWord',
  addReverse: true,
  tags: [],
};

export const getDefaultAnkiOptions = (): AnkiExportOptions => ({ ...DEFAULT_OPTIONS });

export const createAnkiPayload = (
  source: ParsedWordSource,
  options: Partial<AnkiExportOptions> = {}
): AnkiExportPayload => {
  const finalOptions: AnkiExportOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    tags: Array.isArray(options.tags) ? options.tags : DEFAULT_OPTIONS.tags,
  };

  const fieldMapping = DEFAULT_ANKI_FIELD_MAPPING;
  const fields = mapWordToAnkiFields(source.data, finalOptions.addReverse, '', fieldMapping);
  const sourceLemma =
    fields[fieldMapping.word] || source.record.lemma || source.record.lemma_preview || source.id;

  return {
    fields,
    options: finalOptions,
    sourceWordId: source.id,
    sourceLemma,
    fieldMapping,
  };
};
