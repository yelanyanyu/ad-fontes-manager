const { CURRENT_WORD_SCHEMA_VERSION } = require('../../schemas/word/version') as {
  CURRENT_WORD_SCHEMA_VERSION: number;
};

type WordSchemaFreshness = 'current' | 'old' | 'future' | 'unknown';
type WordSchemaDetectionConfidence = 'declared' | 'current-schema' | 'signature' | 'fallback';

interface WordSchemaDetectionDiagnostic {
  code: string;
  message: string;
}

interface WordSchemaDetection {
  declaredVersion: number | null;
  inferredVersion: number | null;
  freshness: WordSchemaFreshness;
  confidence: WordSchemaDetectionConfidence;
  diagnostics: WordSchemaDetectionDiagnostic[];
}

interface WordSchemaDetectionOptions {
  validateCurrent?: (content: Record<string, unknown>) => boolean;
}

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizePositiveInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

const readDeclaredVersion = (content: Record<string, unknown>): number | null => {
  const metadata = content.ad_fontes;
  if (!isRecord(metadata)) return null;
  return normalizePositiveInteger(metadata.word_schema_version);
};

const getFreshness = (version: number): Exclude<WordSchemaFreshness, 'unknown'> => {
  if (version > CURRENT_WORD_SCHEMA_VERSION) return 'future';
  if (version === CURRENT_WORD_SCHEMA_VERSION) return 'current';
  return 'old';
};

const hasObjectSourceWord = (content: Record<string, unknown>): boolean => {
  const etymology = isRecord(content.etymology) ? content.etymology : {};
  const historicalOrigins = isRecord(etymology.historical_origins)
    ? etymology.historical_origins
    : {};
  const sourceWord = historicalOrigins.source_word;
  return (
    isRecord(sourceWord) &&
    ['language', 'word', 'meaning', 'relation'].every(key => typeof sourceWord[key] === 'string')
  );
};

const hasCurrentSignature = (content: Record<string, unknown>): boolean => {
  const yieldValue = isRecord(content.yield) ? content.yield : {};
  const wordFormation = isRecord(content.word_formation) ? content.word_formation : {};
  return (
    Array.isArray(yieldValue.word_forms) ||
    hasObjectSourceWord(content) ||
    Array.isArray(wordFormation.derivations)
  );
};

const hasBasicWordIdentity = (content: Record<string, unknown>): boolean => {
  const yieldValue = isRecord(content.yield) ? content.yield : {};
  return typeof yieldValue.lemma === 'string' && yieldValue.lemma.trim().length > 0;
};

const detectWordSchema = (
  content: Record<string, unknown>,
  options: WordSchemaDetectionOptions = {}
): WordSchemaDetection => {
  const diagnostics: WordSchemaDetectionDiagnostic[] = [];
  const declaredVersion = readDeclaredVersion(content);
  const signatureMatches = hasCurrentSignature(content);

  if (declaredVersion !== null) {
    if (declaredVersion < CURRENT_WORD_SCHEMA_VERSION && signatureMatches) {
      diagnostics.push({
        code: 'schema.declared_shape_mismatch',
        message: 'YAML looks like current structure but declares an old Word Schema Version.',
      });
    }
    return {
      declaredVersion,
      inferredVersion: null,
      freshness: getFreshness(declaredVersion),
      confidence: 'declared',
      diagnostics,
    };
  }

  if (options.validateCurrent?.(content)) {
    return {
      declaredVersion: null,
      inferredVersion: CURRENT_WORD_SCHEMA_VERSION,
      freshness: 'current',
      confidence: 'current-schema',
      diagnostics,
    };
  }

  if (signatureMatches) {
    diagnostics.push({
      code: 'schema.current_signature_invalid',
      message: 'YAML has current-version fields but does not pass the current schema.',
    });
    return {
      declaredVersion: null,
      inferredVersion: 1,
      freshness: 'old',
      confidence: 'signature',
      diagnostics,
    };
  }

  return {
    declaredVersion: null,
    inferredVersion: hasBasicWordIdentity(content) ? 1 : null,
    freshness: hasBasicWordIdentity(content) ? 'old' : 'unknown',
    confidence: 'fallback',
    diagnostics,
  };
};

module.exports = {
  detectWordSchema,
  hasCurrentSignature,
};
