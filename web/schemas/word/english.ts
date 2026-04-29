import { z } from 'zod';
const { createBaseWordSchema } = require('./base');
const {
  isRecord,
  isNonEmptyString,
  requiredString,
  requiredObject,
  nonEmptyArray,
} = require('./helpers');

const base = createBaseWordSchema({ meaningLang: 'en' });

const EnglishWordSchema = z
  .object({
    root: z
      .unknown()
      .optional()
      .refine(value => value === undefined || isRecord(value), 'root must be an object'),
    yield: base.yieldSchema,
    etymology: requiredObject(
      {
        root_and_affixes: requiredObject(
          {
            prefix: requiredString('etymology.root_and_affixes.prefix'),
            root: requiredString('etymology.root_and_affixes.root'),
            suffix: requiredString('etymology.root_and_affixes.suffix'),
            structure_analysis: requiredString('etymology.root_and_affixes.structure_analysis'),
          },
          'etymology.root_and_affixes'
        ),
        historical_origins: requiredObject(
          {
            history_myth: requiredString('etymology.historical_origins.history_myth'),
            source_word: requiredString('etymology.historical_origins.source_word'),
            pie_root: requiredString('etymology.historical_origins.pie_root'),
          },
          'etymology.historical_origins'
        ),
        visual_imagery_zh: requiredString('etymology.visual_imagery_zh'),
        meaning_evolution_zh: requiredString('etymology.meaning_evolution_zh'),
      },
      'etymology'
    ),
    cognate_family: requiredObject(
      {
        cognates: nonEmptyArray('cognate_family.cognates').refine((rows: unknown[]) => {
          return rows.every((item: unknown) => {
            if (!isRecord(item)) return false;
            const rec = item as Record<string, unknown>;
            return isNonEmptyString(rec.word) && isNonEmptyString(rec.logic);
          });
        }, 'cognate_family.cognates items must have word and logic'),
      },
      'cognate_family'
    ),
    application: requiredObject(
      {
        selected_examples: nonEmptyArray('application.selected_examples').refine((rows: unknown[]) => {
          return rows.every((item: unknown) => {
            if (!isRecord(item)) return false;
            const rec = item as Record<string, unknown>;
            return (
              isNonEmptyString(rec.type) &&
              isNonEmptyString(rec.sentence) &&
              isNonEmptyString(rec.translation_zh)
            );
          });
        }, 'application.selected_examples items must have type, sentence, translation_zh'),
      },
      'application'
    ),
    nuance: requiredObject(
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
  .passthrough();

export interface EnglishWordSchemaInput {
  root?: Record<string, unknown>;
  yield: {
    user_word: string;
    lemma: string;
    syllabification: string;
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
      source_word: string;
      pie_root: string;
    };
    visual_imagery_zh: string;
    meaning_evolution_zh: string;
  };
  cognate_family: {
    cognates: Array<{ word: string; logic: string }>;
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
