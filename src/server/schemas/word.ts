// Re-exports from the word/ directory for backward compatibility.
// WordSchema is an alias for EnglishWordSchema â€?all existing consumers work unchanged.
const { EnglishWordSchema, GermanWordSchema } = require('./word/index');

export type { EnglishWordSchemaInput as WordSchemaInput } from './word/english';

module.exports = {
  WordSchema: EnglishWordSchema,
  EnglishWordSchema,
  GermanWordSchema,
};
