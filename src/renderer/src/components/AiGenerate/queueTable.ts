export type QueueTableColumnKey =
  | 'type'
  | 'word'
  | 'language'
  | 'status'
  | 'score'
  | 'improveCount'
  | 'note'
  | 'action'
  | 'remove';

export interface QueueTableColumn {
  key: QueueTableColumnKey;
  label?: string;
  width?: string;
}

export type QueueTableNoteTone = 'neutral' | 'warning' | 'danger' | 'success' | 'muted';

export interface QueueTableNote {
  label: string;
  tone?: QueueTableNoteTone;
  title?: string;
}

export interface QueueTableAction {
  kind: 'pause' | 'resume';
  title: string;
}

export interface QueueTableRow {
  id: string;
  status: string;
  jobType: string;
  word: string;
  language?: string;
  score?: number | null;
  improveCount?: number;
  note?: QueueTableNote;
  action?: QueueTableAction;
  raw?: unknown;
}

export const activeQueueColumns: QueueTableColumn[] = [
  { key: 'type', label: 'Type', width: '76px' },
  { key: 'word', label: 'Word', width: 'minmax(160px, 1fr)' },
  { key: 'language', label: 'Lang', width: '48px' },
  { key: 'status', label: 'Status', width: '64px' },
  { key: 'action', label: 'Act', width: '44px' },
  { key: 'remove', width: '32px' },
];

export const historyQueueColumns: QueueTableColumn[] = [
  { key: 'type', label: 'Type', width: '76px' },
  { key: 'word', label: 'Word', width: 'minmax(180px, 1fr)' },
  { key: 'status', label: 'Status', width: '64px' },
  { key: 'remove', width: '32px' },
];

export const worksetQueueColumns: QueueTableColumn[] = [
  { key: 'type', label: 'Type', width: '76px' },
  { key: 'word', label: 'Word', width: 'minmax(180px, 1fr)' },
  { key: 'score', label: 'Score', width: '72px' },
  { key: 'improveCount', label: 'Fix', width: '48px' },
  { key: 'note', label: 'Note', width: '88px' },
];

export function buildQueueTableTemplate(columns: QueueTableColumn[]): string {
  return columns.map(column => column.width || 'auto').join(' ');
}

export function formatCompactStatus(status: string): string {
  switch (status) {
    case 'complete':
      return 'done';
    case 'partial':
      return 'part';
    case 'running':
      return 'run';
    case 'queued':
      return 'queue';
    default:
      return status;
  }
}

export function formatQueueLanguage(language: string | undefined): string {
  return language === 'de' ? 'DE' : 'EN';
}

export function formatReviewScore(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '--';
  return `${score}/10`;
}

export function reviewScoreClass(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'score-missing';
  if (score >= 8) return 'score-strong';
  if (score >= 6) return 'score-ok';
  return 'score-low';
}

export function formatJobType(jobType: string): string {
  return jobType === 'fix' ? 'fix' : 'gen';
}
