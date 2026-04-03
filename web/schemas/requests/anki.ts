import { z } from 'zod';

const {
  NonEmptyString,
  OptionalTrimmedString,
} = require('../common.ts') as {
  NonEmptyString: z.ZodType<string>;
  OptionalTrimmedString: z.ZodType<string | undefined>;
};

const AnkiTargetFieldsSchema = z.object({
  Word: NonEmptyString,
  Context: z.string().default(''),
  notes: z.string().default(''),
  Back: z.string().default(''),
  'Add Reverse': z.string().default(''),
  Media: z.string().default(''),
});

const AnkiExportOptionsSchema = z.object({
  deckName: NonEmptyString,
  modelName: NonEmptyString,
  addReverse: z.boolean(),
  tags: z.array(NonEmptyString).default([]),
});

const AnkiExportPayloadSchema = z.object({
  fields: AnkiTargetFieldsSchema,
  options: AnkiExportOptionsSchema,
  sourceWordId: OptionalTrimmedString.default(''),
  sourceLemma: OptionalTrimmedString.default(''),
});

const AnkiExportApkgBodySchema = z
  .object({
    fileName: OptionalTrimmedString.default('ad-fontes-export.apkg'),
    payloads: z.array(AnkiExportPayloadSchema).min(1, 'payloads must contain at least one item'),
  })
  .superRefine((input, ctx) => {
    if (!input.payloads.length) return;

    const firstDeckName = input.payloads[0]?.options.deckName;
    const firstModelName = input.payloads[0]?.options.modelName;

    input.payloads.forEach((payload, index) => {
      if (payload.options.deckName !== firstDeckName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'all payloads must use the same deckName',
          path: ['payloads', index, 'options', 'deckName'],
        });
      }

      if (payload.options.modelName !== firstModelName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'all payloads must use the same modelName',
          path: ['payloads', index, 'options', 'modelName'],
        });
      }
    });
  });

module.exports = {
  AnkiTargetFieldsSchema,
  AnkiExportOptionsSchema,
  AnkiExportPayloadSchema,
  AnkiExportApkgBodySchema,
};

