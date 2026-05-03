import type { WordRecord } from '@/types/word-list';

export type AnkiTargetFields = Record<string, string>;

export type AnkiDataSource =
  | 'lemma'
  | 'user_context_sentence'
  | 'other_common_meanings'
  | 'selected_examples_sentence'
  | 'selected_examples_translation'
  | 'synonyms_word'
  | 'synonyms_meaning'
  | 'rendered_html';

export interface FieldMappingEntry {
  source: AnkiDataSource;
  target: string;
}

export type FieldMappingConfig = FieldMappingEntry[];

export type LegacyFieldMappingConfig = Record<string, string>;

export interface AnkiExportOptions {
  deckName: string;
  modelName: string;
  tags: string[];
}

export interface AnkiExportPayload {
  fields: AnkiTargetFields;
  options: AnkiExportOptions;
  sourceWordId: string;
  sourceLemma: string;
  fieldMapping?: FieldMappingConfig;
}

export interface AnkiModelTemplate {
  name: string;
  front: string;
  back: string;
}

export interface AnkiApkgExportRequest {
  fileName: string;
  payloads: AnkiExportPayload[];
  modelFields: string[];
  selectedTemplate: AnkiModelTemplate;
  css: string;
}

export interface AnkiApkgExportByIdsRequest {
  wordIds: string[];
  fieldMapping: FieldMappingConfig;
  options: AnkiExportOptions;
  modelFields: string[];
  selectedTemplate: AnkiModelTemplate;
  css: string;
  fileName?: string;
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

export type AnkiConflictAction = 'overwrite' | 'skip';
export type AnkiImportStrategy = 'add_if_not_duplicate' | 'overwrite_if_duplicate';
export type AnkiDuplicateState = 'ready' | 'duplicate';

export interface AnkiDuplicateConflict {
  noteId: number;
  deckName: string;
  modelName: string;
  word: string;
  existingFields: Partial<AnkiTargetFields>;
  incomingFields: AnkiTargetFields;
}

export type AnkiImportResult =
  | { status: 'imported'; noteId: number }
  | { status: 'overwritten'; noteId: number }
  | { status: 'skipped' }
  | { status: 'conflict'; conflict: AnkiDuplicateConflict };

export type BatchAnkiItemStatus =
  | 'pending'
  | 'checking'
  | 'duplicate'
  | 'ready'
  | 'importing'
  | 'imported'
  | 'skipped'
  | 'cancelled'
  | 'overwritten'
  | 'failed';

export type BatchDuplicateResolution = 'undecided' | 'skip' | 'overwrite';
export type BatchAnkiProgressPhase = 'idle' | 'check' | 'import';

export interface BatchAnkiProgress {
  phase: BatchAnkiProgressPhase;
  processed: number;
  total: number;
  percent: number;
}

export interface BatchAnkiExportItem {
  key: string;
  id: string;
  lemma: string;
  record: WordRecord;
  payload: AnkiExportPayload | null;
  preflightDuplicateState: AnkiDuplicateState | null;
  conflict: AnkiDuplicateConflict | null;
  resolution: BatchDuplicateResolution;
  status: BatchAnkiItemStatus;
  error: string;
  noteId: number | null;
}
