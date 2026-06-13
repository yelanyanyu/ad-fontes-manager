const { loadSchema } = require('../ai/prompts/loader') as {
  loadSchema: (filename: string) => string;
};
const { CURRENT_WORD_SCHEMA_VERSION } = require('../../schemas/word/version') as {
  CURRENT_WORD_SCHEMA_VERSION: number;
};

export type WordSchemaReferenceLanguage = 'en' | 'de';

export interface WordSchemaReference {
  language: WordSchemaReferenceLanguage;
  version: number;
  yaml: string;
}

const SCHEMA_FILES: Record<WordSchemaReferenceLanguage, string> = {
  en: 'english-schema.md',
  de: 'de-schema.md',
};

function isWordSchemaReferenceLanguage(value: unknown): value is WordSchemaReferenceLanguage {
  return value === 'en' || value === 'de';
}

function extractYamlFence(markdown: string): string {
  const match = markdown.match(/```ya?ml\s*([\s\S]*?)```/i);
  if (!match || !match[1]?.trim()) {
    throw new Error('Word schema reference does not contain a YAML fence.');
  }
  return match[1].trimEnd();
}

function getWordSchemaReference(language: unknown): WordSchemaReference {
  if (!isWordSchemaReferenceLanguage(language)) {
    throw new Error('Unsupported schema reference language.');
  }

  return {
    language,
    version: CURRENT_WORD_SCHEMA_VERSION,
    yaml: extractYamlFence(loadSchema(SCHEMA_FILES[language])),
  };
}

module.exports = {
  getWordSchemaReference,
  isWordSchemaReferenceLanguage,
};
