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

const base = createBaseWordSchema({ meaningLang: 'de' });

const requiredStringRecord = (fieldPath: string, keys: string[]) =>
  strictObject(
    Object.fromEntries(keys.map(key => [key, requiredString(`${fieldPath}.${key}`)])),
    fieldPath
  );

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
      word_forms: nonEmptyArray('yield.word_forms').refine((rows: unknown[]) => {
        return rows.every((item: unknown) => isNonEmptyString(item));
      }, 'yield.word_forms items must be non-empty strings'),
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
            source_word: requiredStringRecord('etymology.historical_origins.source_word', [
              'language',
              'word',
              'meaning',
              'relation',
            ]),
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
