import yaml from 'js-yaml';
import { generateCardHTML } from '@/utils/generator';
import type { PreviewYamlData } from '@/types/word-preview';
import {
  CURRENT_WORD_SCHEMA_VERSION,
  DEFAULT_WORD_SCHEMA_VERSION,
  readWordSchemaVersion,
} from '../../../server/shared/wordSchemaVersion';

export type PreviewSchemaFreshness = 'current' | 'old' | 'future';
export type PreviewContentStatus = 'ready' | 'empty' | 'parse-error';

export interface PreviewContent {
  status: PreviewContentStatus;
  rawData: PreviewYamlData | null;
  html: string;
  schemaFreshness: PreviewSchemaFreshness | null;
  error?: string;
}

const isRecord = (value: unknown): value is PreviewYamlData =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function getPreviewSchemaFreshness(data: unknown): PreviewSchemaFreshness {
  const version = readWordSchemaVersion(data);
  if (version > CURRENT_WORD_SCHEMA_VERSION) return 'future';
  if (version < CURRENT_WORD_SCHEMA_VERSION || version === DEFAULT_WORD_SCHEMA_VERSION) {
    return version === CURRENT_WORD_SCHEMA_VERSION ? 'current' : 'old';
  }
  return 'current';
}

export function buildPreviewContent(
  input: string | PreviewYamlData | null | undefined
): PreviewContent {
  if (!input) {
    return { status: 'empty', rawData: null, html: '', schemaFreshness: null };
  }

  let rawData: PreviewYamlData | null = null;
  if (typeof input === 'string') {
    try {
      const parsed = yaml.load(input);
      rawData = isRecord(parsed) ? parsed : null;
    } catch (error) {
      return {
        status: 'parse-error',
        rawData: null,
        html: '',
        schemaFreshness: null,
        error: error instanceof Error ? error.message : 'YAML parse error',
      };
    }
  } else if (isRecord(input)) {
    rawData = input;
  }

  if (!rawData) {
    return {
      status: 'parse-error',
      rawData: null,
      html: '',
      schemaFreshness: null,
      error: 'YAML must be an object',
    };
  }

  return {
    status: 'ready',
    rawData,
    html: generateCardHTML(rawData),
    schemaFreshness: getPreviewSchemaFreshness(rawData),
  };
}
