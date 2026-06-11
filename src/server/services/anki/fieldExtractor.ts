type Dict = Record<string, unknown>;

type AnkiDataSource =
  | 'lemma'
  | 'user_context_sentence'
  | 'other_common_meanings'
  | 'selected_examples_sentence'
  | 'selected_examples_translation'
  | 'synonyms_word'
  | 'synonyms_meaning'
  | 'rendered_html';

type FieldMappingEntry = {
  source: AnkiDataSource;
  target: string;
};

type FieldMappingConfig = FieldMappingEntry[];

type AnkiTargetFields = Record<string, string>;

const { generateCardHTML } = require('../../shared/wordCardHtml') as {
  generateCardHTML: (data: Dict) => string;
};

const getByPath = (obj: Dict, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Dict)[key];
    }
    return undefined;
  }, obj);

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const asRecord = (value: unknown): Dict | null =>
  value && typeof value === 'object' ? (value as Dict) : null;

const extractLemma = (data: Dict): string => toText(getByPath(data, 'yield.lemma'));

const extractUserContextSentence = (data: Dict): string =>
  toText(getByPath(data, 'yield.user_context_sentence'));

const extractOtherCommonMeanings = (data: Dict): string => {
  const arr = getByPath(data, 'yield.other_common_meanings');
  return Array.isArray(arr) ? arr.map(String).join('||') : '';
};

const extractSelectedExamplesSentence = (data: Dict): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr
        .map(example => toText(asRecord(example)?.sentence))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSelectedExamplesTranslation = (data: Dict): string => {
  const arr = getByPath(data, 'application.selected_examples');
  return Array.isArray(arr)
    ? arr
        .map(example => toText(asRecord(example)?.translation_zh))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSynonymsWord = (data: Dict): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr
        .map(synonym => toText(asRecord(synonym)?.word))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractSynonymsMeaning = (data: Dict): string => {
  const arr = getByPath(data, 'nuance.synonyms');
  return Array.isArray(arr)
    ? arr
        .map(synonym => toText(asRecord(synonym)?.meaning_zh))
        .filter(Boolean)
        .join('||')
    : '';
};

const extractRenderedHtml = (data: Dict): string => generateCardHTML(data);

const extractors: Record<AnkiDataSource, (input: Dict) => string> = {
  lemma: extractLemma,
  user_context_sentence: extractUserContextSentence,
  other_common_meanings: extractOtherCommonMeanings,
  selected_examples_sentence: extractSelectedExamplesSentence,
  selected_examples_translation: extractSelectedExamplesTranslation,
  synonyms_word: extractSynonymsWord,
  synonyms_meaning: extractSynonymsMeaning,
  rendered_html: extractRenderedHtml,
};

const extractBySource = (source: AnkiDataSource, data: Dict): string => {
  return extractors[source](data);
};

const buildAnkiFields = (data: Dict, mapping: FieldMappingConfig): AnkiTargetFields => {
  const fields: AnkiTargetFields = {};
  for (const { source, target } of mapping) {
    const normalizedTarget = target.trim();
    if (!normalizedTarget) continue;
    fields[normalizedTarget] = extractBySource(source, data);
  }
  return fields;
};

module.exports = {
  buildAnkiFields,
  extractBySource,
  generateCardHTML,
};
