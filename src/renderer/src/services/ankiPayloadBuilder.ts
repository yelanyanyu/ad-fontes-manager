import yaml from 'js-yaml';
import request from '@/utils/request';
import { createAnkiPayload } from '@/services/ankiExportService';
import type { AnkiExportPayload, FieldMappingConfig, ParsedWordSource } from '@/types/anki';
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
  // Prefer content (v2) over original_yaml (v1) during migration period
  const localData = parseYamlData(record.content || record.original_yaml || record.raw_yaml);
  if (localData) {
    return {
      id: String(record.id),
      record,
      data: localData,
    };
  }

  const full = await request.get<{ content?: unknown; original_yaml?: unknown }>(
    `/v2/words/${encodeURIComponent(record.id)}`,
    {
      skipErrorToast: true,
    }
  );
  const fetched = parseYamlData(full?.content || full?.original_yaml);
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
    tags: string[];
  },
  fieldMapping: FieldMappingConfig
): Promise<AnkiExportPayload> => {
  const source = await resolveParsedSource(record);
  return createAnkiPayload(source, options, fieldMapping);
};
