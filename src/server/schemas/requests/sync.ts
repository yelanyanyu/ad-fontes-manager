import { z } from 'zod';

const { NonEmptyString, OptionalBooleanFromInput } = require('../common') as {
  NonEmptyString: z.ZodType<string>;
  OptionalBooleanFromInput: z.ZodType<boolean | undefined>;
};

const SyncLocalParamsSchema = z.object({
  id: NonEmptyString,
});

const SyncItemSchema = z.object({
  id: NonEmptyString,
  raw_yaml: NonEmptyString,
});

const SyncLocalSaveBodySchema = z.object({
  yaml: NonEmptyString,
  id: NonEmptyString.optional(),
  forceUpdate: OptionalBooleanFromInput,
});

const SyncCheckBodySchema = z.object({
  items: z.array(SyncItemSchema),
});

const SyncExecuteBodySchema = z.object({
  items: z.array(SyncItemSchema),
  forceUpdate: OptionalBooleanFromInput,
});

module.exports = {
  SyncLocalParamsSchema,
  SyncItemSchema,
  SyncLocalSaveBodySchema,
  SyncCheckBodySchema,
  SyncExecuteBodySchema,
};
