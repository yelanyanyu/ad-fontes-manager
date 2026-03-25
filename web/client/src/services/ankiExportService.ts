import type { AnkiExportOptions, AnkiExportPayload, ParsedWordSource } from '@/types/anki';
import { mapWordToAnkiFields } from '@/services/ankiFieldMapper';

const DEFAULT_OPTIONS: AnkiExportOptions = {
  deckName: 'test',
  modelName: 'AdFontesWord',
  addReverse: true,
  tags: ['ad-fontes'],
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

  const fields = mapWordToAnkiFields(source.data, finalOptions.addReverse);
  const sourceLemma =
    fields.Word || source.record.lemma || source.record.lemma_preview || source.id;

  return {
    fields,
    options: finalOptions,
    sourceWordId: source.id,
    sourceLemma,
  };
};
