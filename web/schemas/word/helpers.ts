import { z } from 'zod';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const requiredString = (fieldPath: string) =>
  z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1, `${fieldPath} is required`)
  );

const optionalString = (fieldPath: string) =>
  z.preprocess(
    value => (value == null || value === '' ? undefined : String(value).trim()),
    z.string().optional()
  );

const requiredObject = <T extends z.ZodRawShape>(shape: T, _fieldPath: string) =>
  z.object(shape).passthrough();

const nonEmptyArray = (fieldPath: string) =>
  z.array(z.unknown()).min(1, `${fieldPath} must be a non-empty array`);

module.exports = {
  isRecord,
  isNonEmptyString,
  requiredString,
  optionalString,
  requiredObject,
  nonEmptyArray,
};
