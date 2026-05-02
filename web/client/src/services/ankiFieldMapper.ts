import { generateCardHTML } from '@/utils/generator';
import type { AnkiDataSource, AnkiTargetFields, FieldMappingConfig } from '@/types/anki';

type UnknownRecord = Record<string, unknown>;

const getByPath = (obj: UnknownRecord, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as UnknownRecord)[key];
    }
    return undefined;
  }, obj);

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' ? (value as UnknownRecord) : null;

export const extractLemma = (data: UnknownRecord): string => toText(getByPath(data, 'yield.lemma'));

const extractUserContextSentence = (data: UnknownRecord): string =>
  toText(getByPath(data, 'yield.user_context_sentence'));

const extractOtherCommonMeanings = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'yield.other_common_meanings');
  return Array.isArray(arr) ? arr.map(String).join('||') : '';
};

const extractSelectedExamplesSentence = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr
        .map(example => toText(asRecord(example)?.sentence))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSelectedExamplesTranslation = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr
        .map(example => toText(asRecord(example)?.translation_zh))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSynonymsWord = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr
        .map(synonym => toText(asRecord(synonym)?.word))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSynonymsMeaning = (data: UnknownRecord): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr
        .map(synonym => toText(asRecord(synonym)?.meaning_zh))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractRenderedHtml = (data: UnknownRecord): string => generateCardHTML(data);

export const extractBySource = (source: AnkiDataSource, data: UnknownRecord): string => {
  const extractors: Record<AnkiDataSource, (input: UnknownRecord) => string> = {
    lemma: extractLemma,
    user_context_sentence: extractUserContextSentence,
    other_common_meanings: extractOtherCommonMeanings,
    selected_examples_sentence: extractSelectedExamplesSentence,
    selected_examples_translation: extractSelectedExamplesTranslation,
    synonyms_word: extractSynonymsWord,
    synonyms_meaning: extractSynonymsMeaning,
    rendered_html: extractRenderedHtml,
  };

  return extractors[source](data);
};

export const buildAnkiFields = (
  data: UnknownRecord,
  mapping: FieldMappingConfig
): AnkiTargetFields => {
  const fields: AnkiTargetFields = {};
  for (const { source, target } of mapping) {
    const normalizedTarget = target.trim();
    if (!normalizedTarget) continue;
    fields[normalizedTarget] = extractBySource(source, data);
  }
  return fields;
};
