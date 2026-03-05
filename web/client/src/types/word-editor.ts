export type EditorStatus = '' | 'Valid YAML' | 'Invalid YAML';

export type SaveTarget = 'local' | 'db';

export interface ConflictData {
  status: 'conflict' | string;
  source?: SaveTarget;
  id?: string;
  lemma?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  diff?: unknown[];
}
