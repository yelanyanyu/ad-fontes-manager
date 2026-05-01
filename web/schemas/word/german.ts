import { z } from 'zod';
const { createBaseWordSchema } = require('./base');
const {
  isRecord,
  isNonEmptyString,
  requiredString,
  optionalString,
  requiredObject,
  strictObject,
  nonEmptyArray,
} = require('./helpers');

const base = createBaseWordSchema({ meaningLang: 'de' });

// Optional etymology sub-sections (strict when present)
const historicalPhonologySchema = strictObject(
  {
    pie_root: optionalString('etymology.historical_phonology.pie_root'),
    proto_germanic: optionalString('etymology.historical_phonology.proto_germanic'),
    grimm_step: optionalString('etymology.historical_phonology.grimm_step'),
    verner_law: optionalString('etymology.historical_phonology.verner_law'),
    old_high_german: optionalString('etymology.historical_phonology.old_high_german'),
    consonant_shift: optionalString('etymology.historical_phonology.consonant_shift'),
    middle_high_german: optionalString('etymology.historical_phonology.middle_high_german'),
  },
  'etymology.historical_phonology'
).optional();

const historicalSemanticsSchema = strictObject(
  {
    proto_meaning: optionalString('etymology.historical_semantics.proto_meaning'),
    semantic_shifts: optionalString('etymology.historical_semantics.semantic_shifts'),
  },
  'etymology.historical_semantics'
).optional();

// Dialectal notes — optional but strict
const dialectalNotesSchema = strictObject(
  {
    low_german: optionalString('dialectal_notes.low_german'),
    alemanic_bavarian: optionalString('dialectal_notes.alemanic_bavarian'),
    yiddish: optionalString('dialectal_notes.yiddish'),
  },
  'dialectal_notes'
).optional();

// Observations — optional but strict
const observationsSchema = strictObject(
  {
    register: optionalString('observations.register'),
    false_friends: optionalString('observations.false_friends'),
    calque_status: optionalString('observations.calque_status'),
  },
  'observations'
).optional();

const GermanWordSchema = z
  .object({
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
        historical_phonology: historicalPhonologySchema,
        historical_semantics: historicalSemanticsSchema,
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
            return isNonEmptyString(rec.word) && isNonEmptyString(rec.meaning_zh);
          });
        }, 'nuance.synonyms items must have word and meaning_zh'),
      },
      'nuance'
    ),
    dialectal_notes: dialectalNotesSchema,
    observations: observationsSchema,
  })
  .strict();

module.exports = { GermanWordSchema };
