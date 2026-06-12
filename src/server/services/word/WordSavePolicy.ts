const { CURRENT_WORD_SCHEMA_VERSION, readWordSchemaVersion } =
  require('../../schemas/word/version') as {
    CURRENT_WORD_SCHEMA_VERSION: number;
    readWordSchemaVersion: (content: unknown) => number;
  };

type EditorSaveIntent = 'create' | 'update-existing';
type WordSchemaFreshness = 'current' | 'old' | 'future';

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizePositiveInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

const hasDeclaredWordSchemaVersion = (content: unknown): boolean => {
  if (!isRecord(content)) return false;
  const metadata = content.ad_fontes;
  if (!isRecord(metadata)) return false;
  return normalizePositiveInteger(metadata.word_schema_version) !== null;
};

const getSchemaFreshness = (version: number): WordSchemaFreshness => {
  if (version > CURRENT_WORD_SCHEMA_VERSION) return 'future';
  if (version === CURRENT_WORD_SCHEMA_VERSION) return 'current';
  return 'old';
};

const getNonCurrentNotice = (schemaFreshness: Exclude<WordSchemaFreshness, 'current'>): string =>
  schemaFreshness === 'future'
    ? 'This Word uses a newer structure. You can save edits losslessly, but this app may not fully understand it.'
    : 'This is an old Word structure. You can save edits losslessly; regenerate to update its structure.';

const getFutureCreateOrUpgradeMessage = (): string =>
  'This Word uses a newer structure. Update the app before creating or upgrading it.';

interface StrictValidationPolicyInput {
  content: Record<string, unknown>;
  intent?: EditorSaveIntent;
  baseWordSchemaVersion?: number | null;
  existingContent?: unknown;
}

interface StrictValidationPolicy {
  saveIntent: EditorSaveIntent;
  version: number;
  schemaFreshness: WordSchemaFreshness;
  canMaintainNonCurrentWord: boolean;
  notice?: string;
  blockedFutureMessage?: string;
}

const resolveStrictValidationPolicy = ({
  content,
  intent,
  baseWordSchemaVersion,
  existingContent,
}: StrictValidationPolicyInput): StrictValidationPolicy => {
  const saveIntent = intent === 'update-existing' ? 'update-existing' : 'create';
  const baseVersion = normalizePositiveInteger(baseWordSchemaVersion);
  const existingVersion = existingContent ? readWordSchemaVersion(existingContent) : null;
  const declaredVersion = hasDeclaredWordSchemaVersion(content);
  const version = declaredVersion
    ? readWordSchemaVersion(content)
    : saveIntent === 'update-existing'
      ? (baseVersion ?? existingVersion ?? CURRENT_WORD_SCHEMA_VERSION)
      : CURRENT_WORD_SCHEMA_VERSION;
  const schemaFreshness = getSchemaFreshness(version);
  const canMaintainNonCurrentWord =
    saveIntent === 'update-existing' &&
    schemaFreshness !== 'current' &&
    ((baseVersion !== null && baseVersion !== CURRENT_WORD_SCHEMA_VERSION) ||
      (existingVersion !== null && existingVersion !== CURRENT_WORD_SCHEMA_VERSION));

  return {
    saveIntent,
    version,
    schemaFreshness,
    canMaintainNonCurrentWord,
    notice: canMaintainNonCurrentWord
      ? getNonCurrentNotice(schemaFreshness as Exclude<WordSchemaFreshness, 'current'>)
      : undefined,
    blockedFutureMessage:
      !canMaintainNonCurrentWord && schemaFreshness === 'future'
        ? getFutureCreateOrUpgradeMessage()
        : undefined,
  };
};

interface SavePreparationPolicyInput {
  incomingVersion: number;
  hasExistingWord: boolean;
  existingVersion?: number | null;
  source?: 'import';
}

const requiresCurrentSchemaValidation = ({
  incomingVersion,
  hasExistingWord,
  existingVersion,
  source,
}: SavePreparationPolicyInput): boolean => {
  const isImport = source === 'import';
  return (
    incomingVersion === CURRENT_WORD_SCHEMA_VERSION ||
    (!hasExistingWord && !isImport) ||
    (hasExistingWord && existingVersion === CURRENT_WORD_SCHEMA_VERSION && !isImport)
  );
};

module.exports = {
  getSchemaFreshness,
  hasDeclaredWordSchemaVersion,
  requiresCurrentSchemaValidation,
  resolveStrictValidationPolicy,
};
