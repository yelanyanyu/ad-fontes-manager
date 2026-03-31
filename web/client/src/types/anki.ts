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
