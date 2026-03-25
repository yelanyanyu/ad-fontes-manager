import { z } from 'zod';

const {
  NonEmptyString,
  OptionalBooleanFromInput,
  OptionalIntegerFromQuery,
  OptionalTrimmedString,
  PaginationSchema,
  SortSchema,
} = require('../common.ts') as {
  NonEmptyString: z.ZodType<string>;
  OptionalBooleanFromInput: z.ZodType<boolean | undefined>;
  OptionalIntegerFromQuery: z.ZodType<number | undefined>;
  OptionalTrimmedString: z.ZodType<string | undefined>;
  PaginationSchema: z.ZodObject<{ page: z.ZodType<number | undefined>; limit: z.ZodType<number | undefined> }>;
  SortSchema: z.ZodEnum<{ az: 'az'; za: 'za'; newest: 'newest'; oldest: 'oldest' }>;
};

const WordIdParamsSchema = z.object({
  id: NonEmptyString,
});

const WordListQuerySchema = PaginationSchema.extend({
  search: OptionalTrimmedString,
  sort: z.preprocess(value => {
    if (value === undefined || value === null || value === '') return undefined;
    const singleValue = Array.isArray(value) ? value[0] : value;
    return String(singleValue).trim().toLowerCase();
  }, SortSchema.optional()),
});

const WordDetailsQuerySchema = z.object({
  word: NonEmptyString,
  include: OptionalTrimmedString,
});

const SaveWordBodySchema = z.object({
  yaml: NonEmptyString,
  forceUpdate: OptionalBooleanFromInput,
});

const AddWordBodySchema = z.object({
  word: NonEmptyString,
  yaml: NonEmptyString,
});

module.exports = {
  WordIdParamsSchema,
  WordListQuerySchema,
  WordDetailsQuerySchema,
  SaveWordBodySchema,
  AddWordBodySchema,
  OptionalIntegerFromQuery,
};
