export type SortMode = 'az' | 'za' | 'newest' | 'oldest';
export type SearchMode = 'partial' | 'exact';

export interface WordYield {
  lemma?: string;
  [key: string]: unknown;
}

export interface WordRecord {
  id: string;
  isLocal?: boolean;
  lemma?: string;
  lemma_preview?: string;
  original_yaml?: string | Record<string, unknown>;
  raw_yaml?: string;
  yield?: WordYield;
  [key: string]: unknown;
}

export interface LocalSyncItem {
  id: string;
  raw_yaml: string;
}

export interface SyncCheckItem {
  id: string;
  lemma?: string;
  status: 'conflict' | 'ok' | string;
  diff?: unknown[];
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  [key: string]: unknown;
}

export type SyncAction = 'skip' | 'overwrite';
export type SyncActionMap = Record<string, SyncAction | undefined>;
export type SyncConflict = SyncCheckItem & { status: 'conflict' };

export interface DiffBadge {
  path: string;
  cls: string;
}

export interface DbListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  search: string;
  sort: SortMode;
}
