import yaml from 'js-yaml';
import request from '@/utils/request';
import { createAnkiPayload } from '@/services/ankiExportService';
import type { AnkiExportPayload, ParsedWordSource } from '@/types/anki';
import type { WordRecord } from '@/types/word-list';

type UnknownRecord = Record<string, unknown>;

const parseYamlData = (source: unknown): UnknownRecord | null => {
  if (!source) return null;
  if (typeof source === 'string') {
    const parsed = yaml.load(source);
    return parsed && typeof parsed === 'object' ? (parsed as UnknownRecord) : null;
  }
  if (typeof source === 'object') {
    return source as UnknownRecord;
  }
  return null;
};

export const resolveParsedSource = async (record: WordRecord): Promise<ParsedWordSource> => {
  const localData = parseYamlData(record.original_yaml || record.raw_yaml);
  if (localData) {
    return {
      id: String(record.id),
      record,
      data: localData,
    };
  }

  const full = await request.get<{ original_yaml?: unknown }>(
    `/words/${encodeURIComponent(record.id)}`,
    {
      skipErrorToast: true,
    }
  );
  const fetched = parseYamlData(full?.original_yaml);
  if (!fetched) {
    throw new Error('Failed to resolve YAML source for export');
  }

  return {
    id: String(record.id),
    record,
    data: fetched,
  };
};

export const buildExportPayload = async (
  record: WordRecord,
  options: {
    deckName: string;
    modelName: string;
    addReverse: boolean;
    tags: string[];
  }
): Promise<AnkiExportPayload> => {
  const source = await resolveParsedSource(record);
  return createAnkiPayload(source, options);
};
