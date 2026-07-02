import assert from 'node:assert/strict';
import { test } from 'node:test';

const { EnglishWordSchema, GermanWordSchema } = require('../src/server/schemas/word') as {
  EnglishWordSchema: { safeParse: (input: unknown) => { success: boolean; error?: unknown } };
  GermanWordSchema: { safeParse: (input: unknown) => { success: boolean; error?: unknown } };
};

function createEnglishWord() {
  return {
    ad_fontes: { word_schema_version: 2 },
    yield: {
      user_word: 'abandon',
      lemma: 'abandon',
      syllabification: 'a-ban-don',
      word_forms: ['abandon', 'abandons'],
      user_context_sentence: 'He decided to abandon the plan.',
      part_of_speech: 'verb',
      contextual_meaning: { en: 'to leave behind', zh: '放弃' },
      other_common_meanings: ['to give up'],
    },
    etymology: {
      root_and_affixes: {
        prefix: 'a-',
        root: 'band',
        suffix: '-on',
        structure_analysis: 'a structure note',
      },
      historical_origins: {
        history_myth: 'a history note',
        source_word: {
          language: 'French',
          word: 'abandonner',
          meaning: 'to surrender',
          relation: 'source',
        },
        pie_root: '*bha-',
      },
      visual_imagery_zh: '一个人离开旧计划',
      meaning_evolution_zh: '从交付到放弃',
    },
    word_formation: { derivations: [] },
    cognate_family: {
      cognates: [
        {
          word: 'abandonner',
          language: 'French',
          relation: 'source',
          logic: 'French source form',
        },
      ],
    },
    application: {
      selected_examples: [
        {
          type: 'daily',
          sentence: 'He decided to abandon the plan.',
          translation_zh: '他决定放弃这个计划。',
        },
      ],
    },
    nuance: {
      image_differentiation_zh: 'abandon 强调主动离开',
      synonyms: [{ word: 'desert', meaning_zh: '遗弃' }],
    },
  };
}

function createGermanWord() {
  return {
    ad_fontes: { word_schema_version: 2 },
    yield: {
      user_word: 'Haus',
      lemma: 'Haus',
      syllabification: 'Haus',
      word_forms: ['Haus', 'Haeuser'],
      user_context_sentence: 'Das Haus ist alt.',
      part_of_speech: 'noun',
      genus: 'das',
      kasus: 'Nominativ',
      contextual_meaning: { de: 'Gebaeude zum Wohnen', zh: '房子' },
      other_common_meanings: ['home'],
    },
    etymology: {
      morphological_analysis: {
        word_formation: 'simplex',
        structure_analysis: 'single stem',
        components: [{ element: 'Haus', type: 'stem', de_meaning: 'Gebaeude' }],
      },
      historical_origins: {
        earliest_attestation: 'Old High German hus',
        source_word: {
          language: 'Old High German',
          word: 'hus',
          meaning: 'house',
          relation: 'ancestor',
        },
        pgmc_root: '*husan',
        pie_root: '*keu-',
        sound_changes: 'regular Germanic development',
      },
      visual_imagery_zh: '一座房子',
      meaning_evolution_zh: '从遮蔽处到住宅',
    },
    word_formation: { derivations: [] },
    cognate_family: {
      cognates: [{ word: 'house', language: 'English', relation: 'cognate', logic: 'shared root' }],
    },
    application: {
      selected_examples: [
        { type: 'daily', sentence: 'Das Haus ist alt.', translation_zh: '这座房子很旧。' },
      ],
    },
    nuance: {
      image_differentiation_zh: 'Haus 指建筑本身',
      synonyms: [
        {
          word: 'Wohnung',
          meaning_zh: '公寓',
          connotation_difference: 'Wohnung is a unit inside a building',
        },
      ],
    },
  };
}

void test('English schema allows word_formation.derivations to be empty', () => {
  const result = EnglishWordSchema.safeParse(createEnglishWord());

  assert.equal(result.success, true);
});

void test('German schema allows word_formation.derivations to be empty', () => {
  const result = GermanWordSchema.safeParse(createGermanWord());

  assert.equal(result.success, true);
});

void test('derivations still validates item shape when entries are present', () => {
  const word = createEnglishWord();
  word.word_formation.derivations = [{ language: 'en' }] as never[];

  const result = EnglishWordSchema.safeParse(word);

  assert.equal(result.success, false);
});
