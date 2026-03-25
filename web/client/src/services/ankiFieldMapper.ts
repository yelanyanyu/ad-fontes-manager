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

const collectNotes = (data: UnknownRecord): string => {
  const parts = [
    `POS: ${toText(getByPath(data, 'yield.part_of_speech'))}`,
    `Syllabification: ${toText(getByPath(data, 'yield.syllabification'))}`,
    `EN: ${toText(getByPath(data, 'yield.contextual_meaning.en'))}`,
    `ZH: ${toText(getByPath(data, 'yield.contextual_meaning.zh'))}`,
    `Root: ${toText(getByPath(data, 'etymology.root_and_affixes.root'))}`,
  ].filter(item => item && !item.endsWith(': '));

  return parts.join('\n');
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
    notes: collectNotes(data),
    Back: back,
    'Add Reverse': addReverse ? 'true' : '',
    Media: media,
  };
};
