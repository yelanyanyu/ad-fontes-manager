import yaml from 'js-yaml';
import request from '@/utils/request';
import {
  WORD_EXPORT_FORMAT,
  WORD_EXPORT_VERSION,
  type WordExportFile,
  type WordExportItem,
} from './wordExportService';

export interface WordImportResult {
  total: number;
  imported: number;
  skippedConflicts: number;
  failed: number;
  errors: Array<{ lemma: string; message: string }>;
}

interface SaveConflictResponse {
  success?: boolean;
  status?: string;
  lemma?: string;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readRequiredString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Word Import item is missing ${key}.`);
  }
  return value.trim();
};

const parseImportItem = (value: unknown): WordExportItem => {
  if (!isRecord(value)) {
    throw new Error('Word Import items must be objects.');
  }

  const content = value.content;
  if (!isRecord(content)) {
    throw new Error('Word Import item is missing structured Content.');
  }

  return {
    lemma: readRequiredString(value, 'lemma'),
    language: readRequiredString(value, 'language'),
    partOfSpeech:
      typeof value.partOfSpeech === 'string' && value.partOfSpeech.trim()
        ? value.partOfSpeech
        : null,
    content,
  };
};

export const parseWordImportFile = (rawJson: string): WordExportFile => {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('Word Import file must be a JSON object.');
  }
  if (parsed.format !== WORD_EXPORT_FORMAT || parsed.version !== WORD_EXPORT_VERSION) {
    throw new Error('Unsupported Word Import file format.');
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error('Word Import file does not contain any Words.');
  }

  return {
    format: WORD_EXPORT_FORMAT,
    version: WORD_EXPORT_VERSION,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    items: parsed.items.map(parseImportItem),
  };
};

const toYamlForSave = (item: WordExportItem): string => {
  const content = {
    ...item.content,
    yield: {
      ...(isRecord(item.content.yield) ? item.content.yield : {}),
      lemma: item.lemma,
      language: item.language,
      ...(item.partOfSpeech ? { part_of_speech: item.partOfSpeech } : {}),
    },
  };
  return yaml.dump(content, { lineWidth: -1, noRefs: true });
};

export const importWordExportFile = async (
  exportFile: WordExportFile
): Promise<WordImportResult> => {
  const result: WordImportResult = {
    total: exportFile.items.length,
    imported: 0,
    skippedConflicts: 0,
    failed: 0,
    errors: [],
  };

  for (const item of exportFile.items) {
    try {
      const response = await request.post<boolean | SaveConflictResponse>(
        '/v2/words',
        { yaml: toYamlForSave(item), forceUpdate: false },
        { skipErrorToast: true }
      );
      if (response && typeof response === 'object' && response.status === 'conflict') {
        result.skippedConflicts += 1;
        continue;
      }
      if (response && typeof response === 'object' && response.success === false) {
        result.failed += 1;
        result.errors.push({
          lemma: item.lemma,
          message: response.error || 'Import failed',
        });
        continue;
      }
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        lemma: item.lemma,
        message: error instanceof Error ? error.message : 'Import failed',
      });
    }
  }

  return result;
};
