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
} = require('./helpers');

const base = createBaseWordSchema({ meaningLang: 'de' });

const GermanWordSchema = z
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
      genus: requiredString('yield.genus'),
      kasus: requiredString('yield.kasus'),
    }),
    etymology: strictObject(
      {
        morphological_analysis: strictObject(
          {
            word_formation: requiredString('etymology.morphological_analysis.word_formation'),
            structure_analysis: requiredString(
              'etymology.morphological_analysis.structure_analysis'
            ),
            components: nonEmptyArray('etymology.morphological_analysis.components').refine(
              (rows: unknown[]) => {
                return rows.every((item: unknown) => {
                  if (!isRecord(item)) return false;
                  const rec = item as Record<string, unknown>;
                  return (
                    isNonEmptyString(rec.element) &&
                    isNonEmptyString(rec.type) &&
                    isNonEmptyString(rec.de_meaning)
                  );
                });
              },
              'etymology.morphological_analysis.components items must have element, type, de_meaning'
            ),
          },
          'etymology.morphological_analysis'
        ),
        historical_origins: strictObject(
          {
            earliest_attestation: requiredString(
              'etymology.historical_origins.earliest_attestation'
            ),
            source_form: requiredString('etymology.historical_origins.source_form'),
            pgmc_root: requiredString('etymology.historical_origins.pgmc_root'),
            pie_root: requiredString('etymology.historical_origins.pie_root'),
            sound_changes: requiredString('etymology.historical_origins.sound_changes'),
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
            return (
              isNonEmptyString(rec.word) &&
              isNonEmptyString(rec.german_equivalent) &&
              isNonEmptyString(rec.logic)
            );
          });
        }, 'cognate_family.cognates items must have word, german_equivalent, and logic'),
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
    nuance: requiredObject(
      {
        image_differentiation_zh: requiredString('nuance.image_differentiation_zh'),
        synonyms: nonEmptyArray('nuance.synonyms').refine((rows: unknown[]) => {
          return rows.every((item: unknown) => {
            if (!isRecord(item)) return false;
            const rec = item as Record<string, unknown>;
            return (
              isNonEmptyString(rec.word) &&
              isNonEmptyString(rec.meaning_zh) &&
              isNonEmptyString(rec.connotation_difference)
            );
          });
        }, 'nuance.synonyms items must have word, meaning_zh, and connotation_difference'),
      },
      'nuance'
    ),
  })
  .strict();

module.exports = { GermanWordSchema };
