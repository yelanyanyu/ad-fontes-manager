import yaml from 'js-yaml';
import type { WordRecord } from '@/types/word-list';

export const WORD_EXPORT_FORMAT = 'ad-fontes.words.export';
export const WORD_EXPORT_VERSION = 1;

export interface WordExportItem {
  id?: string;
  lemma: string;
  language: string;
  partOfSpeech?: string | null;
  content: Record<string, unknown>;
  yaml?: string;
  createdAt?: string;
  updatedAt?: string;
  revisionCount?: number;
}

export interface WordExportFile {
  format: typeof WORD_EXPORT_FORMAT;
  version: typeof WORD_EXPORT_VERSION;
  exportedAt: string;
  items: WordExportItem[];
}

interface BuildWordExportOptions {
  exportedAt?: string;
}

const DEFAULT_FILE_NAME = 'ad-fontes-words-export.json';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  throw new Error('Word Export requires structured Word Content.');
};

const readNestedString = (record: Record<string, unknown>, path: string[]): string | undefined => {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() ? current : undefined;
};

const readOptionalString = (record: WordRecord, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const readOptionalNumber = (record: WordRecord, key: string): number | undefined => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const toExportItem = (record: WordRecord): WordExportItem => {
  const content = asRecord(record.content);
  const lemma = record.lemma || readNestedString(content, ['yield', 'lemma']);
  const language =
    readOptionalString(record, 'language') ||
    readNestedString(content, ['yield', 'language']) ||
    'en';

  if (!lemma) {
    throw new Error('Word Export requires each Word to have a Lemma.');
  }

  return {
    id: record.id,
    lemma,
    language,
    partOfSpeech: readOptionalString(record, 'part_of_speech') ?? null,
    content,
    yaml: yaml.dump(content, { lineWidth: -1, noRefs: true }),
    createdAt: readOptionalString(record, 'created_at'),
    updatedAt: readOptionalString(record, 'updated_at'),
    revisionCount: readOptionalNumber(record, 'revision_count'),
  };
};

export const buildWordExportFile = (
  records: WordRecord[],
  options: BuildWordExportOptions = {}
): WordExportFile => {
  if (!records.length) {
    throw new Error('Select at least one Word to export.');
  }

  return {
    format: WORD_EXPORT_FORMAT,
    version: WORD_EXPORT_VERSION,
    exportedAt: options.exportedAt || new Date().toISOString(),
    items: records.map(toExportItem),
  };
};

const sanitizeJsonFileName = (value: string): string => {
  const normalized = value.replace(/[\\/]/g, '_').trim();
  if (!normalized) return DEFAULT_FILE_NAME;
  return normalized.toLowerCase().endsWith('.json') ? normalized : `${normalized}.json`;
};

export const makeWordExportFileName = (count: number, date = new Date()): string => {
  const day = date.toISOString().slice(0, 10);
  return sanitizeJsonFileName(`ad-fontes-words-${count}-${day}.json`);
};

export const downloadWordExportFile = (
  exportFile: WordExportFile,
  fileName = makeWordExportFileName(exportFile.items.length)
): string => {
  const normalizedFileName = sanitizeJsonFileName(fileName);
  const blob = new Blob([JSON.stringify(exportFile, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = normalizedFileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return normalizedFileName;
};
