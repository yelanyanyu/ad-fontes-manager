import { generateCardHTML } from '@/utils/generator';
import type { AnkiCanonicalFields, AnkiFieldMapping, AnkiTargetFields } from '@/types/anki';

type UnknownRecord = Record<string, unknown>;

export const DEFAULT_ANKI_FIELD_MAPPING: AnkiFieldMapping = {
  word: 'Word',
  context: 'Context',
  notes: 'notes',
  back: 'Back',
  addReverse: 'Add Reverse',
  media: 'Media',
};

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

const firstExampleSentence = (data: UnknownRecord): string => {
  const examples = getByPath(data, 'application.selected_examples');
  if (!Array.isArray(examples) || examples.length === 0) return '';
  const first = examples[0];
  if (!first || typeof first !== 'object') return '';
  return toText((first as UnknownRecord).sentence);
};

export const buildCanonicalAnkiFields = (
  data: UnknownRecord,
  addReverse: boolean,
  media = ''
): AnkiCanonicalFields => {
  const lemma = toText(getByPath(data, 'yield.lemma'));
  const context =
    toText(getByPath(data, 'yield.user_context_sentence')) || firstExampleSentence(data);
  const back = generateCardHTML(data);

  return {
    word: lemma,
    context,
    notes: '',
    back,
    addReverse: addReverse ? 'true' : '',
    media,
  };
};

export const mapCanonicalFieldsToAnkiFields = (
  canonicalFields: AnkiCanonicalFields,
  fieldMapping: AnkiFieldMapping = DEFAULT_ANKI_FIELD_MAPPING
): AnkiTargetFields => {
  return {
    [fieldMapping.word]: canonicalFields.word,
    [fieldMapping.context]: canonicalFields.context,
    [fieldMapping.notes]: canonicalFields.notes,
    [fieldMapping.back]: canonicalFields.back,
    [fieldMapping.addReverse]: canonicalFields.addReverse,
    [fieldMapping.media]: canonicalFields.media,
  };
};

export const mapWordToAnkiFields = (
  data: UnknownRecord,
  addReverse: boolean,
  media = '',
  fieldMapping: AnkiFieldMapping = DEFAULT_ANKI_FIELD_MAPPING
): AnkiTargetFields => {
  const canonicalFields = buildCanonicalAnkiFields(data, addReverse, media);
  return mapCanonicalFieldsToAnkiFields(canonicalFields, fieldMapping);
};
