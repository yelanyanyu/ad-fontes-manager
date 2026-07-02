import { z } from 'zod';
const { createBaseWordSchema } = require('./base');
const { CURRENT_WORD_SCHEMA_VERSION } = require('./version') as {
  CURRENT_WORD_SCHEMA_VERSION: number;
};
const {
  isRecord,
  isNonEmptyString,
  requiredString,
  requiredObject,
  strictObject,
  nonEmptyArray,
  arrayAllowEmpty,
} = require('./helpers');

const base = createBaseWordSchema({ meaningLang: 'en' });

const requiredStringRecord = (fieldPath: string, keys: string[]) =>
  strictObject(
    Object.fromEntries(keys.map(key => [key, requiredString(`${fieldPath}.${key}`)])),
    fieldPath
  );

const EnglishWordSchema = z
  .object({
    ad_fontes: strictObject(
      {
        word_schema_version: z.literal(CURRENT_WORD_SCHEMA_VERSION),
      },
      'ad_fontes'
    ),
    root: z
      .unknown()
      .optional()
      .refine(value => value === undefined || isRecord(value), 'root must be an object'),
    yield: base.yieldSchema.extend({
      word_forms: nonEmptyArray('yield.word_forms').refine((rows: unknown[]) => {
        return rows.every((item: unknown) => isNonEmptyString(item));
      }, 'yield.word_forms items must be non-empty strings'),
    }),
    etymology: strictObject(
      {
        root_and_affixes: strictObject(
          {
            prefix: requiredString('etymology.root_and_affixes.prefix'),
            root: requiredString('etymology.root_and_affixes.root'),
            suffix: requiredString('etymology.root_and_affixes.suffix'),
            structure_analysis: requiredString('etymology.root_and_affixes.structure_analysis'),
          },
          'etymology.root_and_affixes'
        ),
        historical_origins: strictObject(
          {
            history_myth: requiredString('etymology.historical_origins.history_myth'),
            source_word: requiredStringRecord('etymology.historical_origins.source_word', [
              'language',
              'word',
              'meaning',
              'relation',
            ]),
            pie_root: requiredString('etymology.historical_origins.pie_root'),
          },
          'etymology.historical_origins'
        ),
        visual_imagery_zh: requiredString('etymology.visual_imagery_zh'),
        meaning_evolution_zh: requiredString('etymology.meaning_evolution_zh'),
      },
      'etymology'
    ),
    word_formation: requiredObject(
      {
        derivations: arrayAllowEmpty('word_formation.derivations').refine((rows: unknown[]) => {
          return rows.every((item: unknown) => {
            if (!isRecord(item)) return false;
            const rec = item as Record<string, unknown>;
            return (
              isNonEmptyString(rec.language) &&
              isNonEmptyString(rec.word) &&
              isNonEmptyString(rec.part_of_speech) &&
              isNonEmptyString(rec.relation) &&
              isNonEmptyString(rec.logic)
            );
          });
        }, 'word_formation.derivations items must have language, word, part_of_speech, relation, logic'),
      },
      'word_formation'
    ),
    cognate_family: requiredObject(
      {
        cognates: nonEmptyArray('cognate_family.cognates').refine((rows: unknown[]) => {
          return rows.every((item: unknown) => {
            if (!isRecord(item)) return false;
            const rec = item as Record<string, unknown>;
            return (
              isNonEmptyString(rec.word) &&
              isNonEmptyString(rec.language) &&
              isNonEmptyString(rec.relation) &&
              isNonEmptyString(rec.logic)
            );
          });
        }, 'cognate_family.cognates items must have word, language, relation, logic'),
      },
      'cognate_family'
    ),
    application: requiredObject(
      {
        selected_examples: nonEmptyArray('application.selected_examples').refine(
          (rows: unknown[]) => {
            return rows.every((item: unknown) => {
              if (!isRecord(item)) return false;
              const rec = item as Record<string, unknown>;
              return (
                isNonEmptyString(rec.type) &&
                isNonEmptyString(rec.sentence) &&
                isNonEmptyString(rec.translation_zh)
              );
            });
          },
          'application.selected_examples items must have type, sentence, translation_zh'
        ),
      },
      'application'
    ),
    nuance: strictObject(
      {
        image_differentiation_zh: requiredString('nuance.image_differentiation_zh'),
        synonyms: nonEmptyArray('nuance.synonyms').refine((rows: unknown[]) => {
          return rows.every((item: unknown) => {
            if (!isRecord(item)) return false;
            const rec = item as Record<string, unknown>;
            return isNonEmptyString(rec.word) && isNonEmptyString(rec.meaning_zh);
          });
        }, 'nuance.synonyms items must have word and meaning_zh'),
      },
      'nuance'
    ),
  })
  .strict();

export interface EnglishWordSchemaInput {
  ad_fontes: {
    word_schema_version: 2;
  };
  root?: Record<string, unknown>;
  yield: {
    user_word: string;
    lemma: string;
    syllabification: string;
    word_forms: string[];
    user_context_sentence: string;
    part_of_speech: string;
    contextual_meaning: {
      en: string;
      zh: string;
    };
    other_common_meanings: unknown[];
  };
  etymology: {
    root_and_affixes: {
      prefix: string;
      root: string;
      suffix: string;
      structure_analysis: string;
    };
    historical_origins: {
      history_myth: string;
      source_word: {
        language: string;
        word: string;
        meaning: string;
        relation: string;
      };
      pie_root: string;
    };
    visual_imagery_zh: string;
    meaning_evolution_zh: string;
  };
  word_formation: {
    derivations: Array<{
      language: string;
      word: string;
      part_of_speech: string;
      relation: string;
      logic: string;
    }>;
  };
  cognate_family: {
    cognates: Array<{ word: string; language: string; relation: string; logic: string }>;
  };
  application: {
    selected_examples: Array<{ type: string; sentence: string; translation_zh: string }>;
  };
  nuance: {
    image_differentiation_zh: string;
    synonyms: Array<{ word: string; meaning_zh: string }>;
  };
}

module.exports = { EnglishWordSchema };
