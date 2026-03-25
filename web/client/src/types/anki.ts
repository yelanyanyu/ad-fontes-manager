import type { WordRecord } from '@/types/word-list';

export interface AnkiTargetFields {
  Word: string;
  Context: string;
  notes: string;
  Back: string;
  'Add Reverse': string;
  Media: string;
}

export interface AnkiExportOptions {
  deckName: string;
  modelName: string;
  addReverse: boolean;
  tags: string[];
}

export interface AnkiExportPayload {
  fields: AnkiTargetFields;
  options: AnkiExportOptions;
  sourceWordId: string;
  sourceLemma: string;
}

export interface AnkiConnectInvokePayload {
  action: string;
  version: number;
  params?: Record<string, unknown>;
}

export interface AnkiConnectInvokeResult<T = unknown> {
  result: T;
  error: string | null;
}

export interface ParsedWordSource {
  id: string;
  data: Record<string, unknown>;
  record: WordRecord;
}
