import { z } from 'zod';

const { NonEmptyString, OptionalTrimmedString } = require('../common.ts') as {
  NonEmptyString: z.ZodType<string>;
  OptionalTrimmedString: z.ZodType<string | undefined>;
};

const AnkiTargetFieldsSchema = z
  .record(NonEmptyString, z.string())
  .refine(fields => Object.keys(fields).length > 0, {
    message: 'fields must contain at least one key',
  });

const AnkiExportOptionsSchema = z.object({
  deckName: NonEmptyString,
  modelName: NonEmptyString,
  tags: z.array(NonEmptyString).default([]),
});

const AnkiExportPayloadSchema = z.object({
  fields: AnkiTargetFieldsSchema,
  options: AnkiExportOptionsSchema,
  sourceWordId: OptionalTrimmedString.default(''),
  sourceLemma: OptionalTrimmedString.default(''),
});

const AnkiSelectedTemplateSchema = z.object({
  name: NonEmptyString,
  front: z.string(),
  back: z.string(),
});

const extractTemplateFields = (template: string): string[] => {
  if (!template) return [];

  const fields = new Set<string>();
  const regex = /{{[^}]+}}/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(template))) {
    const raw = String(match[0] || '')
      .replace(/^{+|}+$/g, '')
      .trim();
    if (!raw || raw === 'FrontSide') continue;
    const normalized = raw
      .replace(/^#|^\//, '')
      .split(':')[0]
      .trim();
    if (normalized) {
      fields.add(normalized);
    }
  }
  return [...fields];
};

const AnkiExportApkgBodySchema = z
  .object({
    fileName: OptionalTrimmedString.default('ad-fontes-export.apkg'),
    payloads: z.array(AnkiExportPayloadSchema).min(1, 'payloads must contain at least one item'),
    modelFields: z.array(NonEmptyString).min(1, 'modelFields must contain at least one field'),
    selectedTemplate: AnkiSelectedTemplateSchema,
    css: z.string().min(1, 'CSS must not be empty when AnkiConnect is available'),
  })
  .superRefine((input, ctx) => {
    if (!input.payloads.length) return;

    const modelFieldSet = new Set(input.modelFields);
    if (modelFieldSet.size !== input.modelFields.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'modelFields must be unique',
        path: ['modelFields'],
      });
    }

    const referencedTemplateFields = new Set([
      ...extractTemplateFields(input.selectedTemplate.front),
      ...extractTemplateFields(input.selectedTemplate.back),
    ]);

    referencedTemplateFields.forEach(fieldName => {
      if (!modelFieldSet.has(fieldName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `selectedTemplate references unknown field "${fieldName}"`,
          path: ['selectedTemplate'],
        });
      }
    });

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

      referencedTemplateFields.forEach(fieldName => {
        if (!Object.prototype.hasOwnProperty.call(payload.fields, fieldName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `payload fields must include template field "${fieldName}"`,
            path: ['payloads', index, 'fields', fieldName],
          });
        }
      });
    });
  });

module.exports = {
  AnkiTargetFieldsSchema,
  AnkiExportOptionsSchema,
  AnkiExportPayloadSchema,
  AnkiExportApkgBodySchema,
};
