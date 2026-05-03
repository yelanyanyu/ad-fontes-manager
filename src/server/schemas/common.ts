import { z } from 'zod';

const toSingleValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

const toTrimmedStringOrUndefined = (value: unknown): string | undefined => {
  const singleValue = toSingleValue(value);
  if (singleValue === undefined || singleValue === null) return undefined;

  const normalized = String(singleValue).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const toOptionalInteger = (value: unknown): number | undefined | unknown => {
  const normalized = toTrimmedStringOrUndefined(value);
  if (normalized === undefined) return undefined;

  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : normalized;
};

const toOptionalBoolean = (value: unknown): boolean | undefined | unknown => {
  const singleValue = toSingleValue(value);
  if (singleValue === undefined || singleValue === null || singleValue === '') return undefined;
  if (typeof singleValue === 'boolean') return singleValue;

  const normalized = String(singleValue).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return singleValue;
};

const NonEmptyString = z.string().trim().min(1, 'must not be empty');
const NonEmptyStringArray = z.array(NonEmptyString).min(1, 'array must not be empty');
const UUIDSchema = z.string().uuid('invalid uuid');
const SortSchema = z.enum(['az', 'za', 'newest', 'oldest']);

const OptionalIntegerFromQuery = z.preprocess(
  toOptionalInteger,
  z.number().int().positive().optional()
);
const OptionalBooleanFromInput = z.preprocess(toOptionalBoolean, z.boolean().optional());
const OptionalTrimmedString = z.preprocess(
  toTrimmedStringOrUndefined,
  z.string().trim().min(1).optional()
);

const PaginationSchema = z.object({
  page: OptionalIntegerFromQuery,
  limit: OptionalIntegerFromQuery,
});

module.exports = {
  toSingleValue,
  NonEmptyString,
  NonEmptyStringArray,
  UUIDSchema,
  SortSchema,
  OptionalIntegerFromQuery,
  OptionalBooleanFromInput,
  OptionalTrimmedString,
  PaginationSchema,
};
