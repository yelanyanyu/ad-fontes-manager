import { generateCardHTML } from '@/utils/generator';
import type { AnkiTargetFields } from '@/types/anki';

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

const firstExampleSentence = (data: UnknownRecord): string => {
  const examples = getByPath(data, 'application.selected_examples');
  if (!Array.isArray(examples) || examples.length === 0) return '';
  const first = examples[0];
  if (!first || typeof first !== 'object') return '';
  return toText((first as UnknownRecord).sentence);
};

export const mapWordToAnkiFields = (
  data: UnknownRecord,
  addReverse: boolean,
  media = ''
): AnkiTargetFields => {
  const lemma = toText(getByPath(data, 'yield.lemma'));
  const context =
    toText(getByPath(data, 'yield.user_context_sentence')) || firstExampleSentence(data);
  const back = generateCardHTML(data);

  return {
    Word: lemma,
    Context: context,
    notes: '',
    Back: back,
    'Add Reverse': addReverse ? 'true' : '',
    Media: media,
  };
};
