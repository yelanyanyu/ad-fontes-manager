import { z } from 'zod';
const { createBaseWordSchema } = require('./base');
const {
  isRecord,
  isNonEmptyString,
  requiredString,
  optionalString,
  requiredObject,
  nonEmptyArray,
} = require('./helpers');

const base = createBaseWordSchema({ meaningLang: 'de' });

const GermanWordSchema = z
  .object({
    root: z
      .unknown()
      .optional()
      .refine(value => value === undefined || isRecord(value), 'root must be an object'),
    yield: base.yieldSchema.extend({
      genus: optionalString('yield.genus'),
      kasus: optionalString('yield.kasus'),
    }),
    etymology: requiredObject(
      {
        morphological_analysis: requiredObject(
          {
            word_formation: requiredString('etymology.morphological_analysis.word_formation'),
            structure_analysis: requiredString(
              'etymology.morphological_analysis.structure_analysis'
            ),
            components: nonEmptyArray(
              'etymology.morphological_analysis.components'
            ).refine((rows: unknown[]) => {
              return rows.every((item: unknown) => {
                if (!isRecord(item)) return false;
                const rec = item as Record<string, unknown>;
                return (
                  isNonEmptyString(rec.element) &&
                  isNonEmptyString(rec.type) &&
                  isNonEmptyString(rec.de_meaning)
                );
              });
            }, 'etymology.morphological_analysis.components items must have element, type, de_meaning'),
          },
          'etymology.morphological_analysis'
        ),
        historical_origins: requiredObject(
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
    ).passthrough(), // allows germanic_differentiation_zh
    dialectal_notes: z
      .object({
        low_german: optionalString('dialectal_notes.low_german'),
        alemanic_bavarian: optionalString('dialectal_notes.alemanic_bavarian'),
        yiddish: optionalString('dialectal_notes.yiddish'),
      })
      .passthrough()
      .optional(),
    observations: z
      .object({
        register: optionalString('observations.register'),
        false_friends: optionalString('observations.false_friends'),
        calque_status: optionalString('observations.calque_status'),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

module.exports = { GermanWordSchema };
