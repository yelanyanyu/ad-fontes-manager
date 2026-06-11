export const CURRENT_WORD_SCHEMA_VERSION = 2;
export const DEFAULT_WORD_SCHEMA_VERSION = 1;

const APP_METADATA_KEY = 'ad_fontes';
const WORD_SCHEMA_VERSION_KEY = 'word_schema_version';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const readWordSchemaVersion = (content: unknown): number => {
  if (!isRecord(content)) return DEFAULT_WORD_SCHEMA_VERSION;
  const metadata = content[APP_METADATA_KEY];
  if (!isRecord(metadata)) return DEFAULT_WORD_SCHEMA_VERSION;
  const value = metadata[WORD_SCHEMA_VERSION_KEY];
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_WORD_SCHEMA_VERSION;
};

export const ensureCurrentWordSchemaMetadata = (
  content: Record<string, unknown>
): Record<string, unknown> => {
  const metadata = isRecord(content[APP_METADATA_KEY])
    ? { ...(content[APP_METADATA_KEY] as Record<string, unknown>) }
    : {};

  const existing = metadata[WORD_SCHEMA_VERSION_KEY];
  if (
    typeof existing === 'number' &&
    Number.isInteger(existing) &&
    existing > CURRENT_WORD_SCHEMA_VERSION
  ) {
    throw new Error(`Unsupported Word Schema Version: ${existing}`);
  }

  metadata[WORD_SCHEMA_VERSION_KEY] = CURRENT_WORD_SCHEMA_VERSION;
  content[APP_METADATA_KEY] = metadata;
  return content;
};

export const isLatestWordSchemaVersion = (version: number): boolean =>
  version === CURRENT_WORD_SCHEMA_VERSION;

module.exports = {
  CURRENT_WORD_SCHEMA_VERSION,
  DEFAULT_WORD_SCHEMA_VERSION,
  readWordSchemaVersion,
  ensureCurrentWordSchemaMetadata,
  isLatestWordSchemaVersion,
};
