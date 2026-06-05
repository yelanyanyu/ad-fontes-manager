import type { RunMetrics } from '@/composables/useAiGenerate';

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
  runMetrics?: RunMetrics;
  runMetricsExpanded?: boolean;
  raw?: unknown;
}

export type QueueSurfaceMode = 'active' | 'history' | 'workset';

export interface QueueRunMetricsDisclosureState {
  expandedByMode: Record<QueueSurfaceMode, boolean>;
  expandedRows: Set<string>;
  collapsedRows: Set<string>;
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

export function formatDurationMs(durationMs: number | null | undefined): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return '';

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function formatTokenCount(tokens: number | null | undefined): string {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens < 0) return '';
  if (tokens >= 1000) {
    const compact = (tokens / 1000).toFixed(tokens >= 10000 ? 1 : 1).replace(/\.0$/, '');
    return `${compact}k tok`;
  }
  return `${Math.round(tokens)} tok`;
}

export function formatRunMetricsSummary(runMetrics: RunMetrics | undefined): string {
  const duration = formatDurationMs(runMetrics?.totalDurationMs);
  const tokens = formatTokenCount(runMetrics?.totalTokens);
  if (!duration && !tokens) return '';
  if (!duration) return `Total ${tokens}`;
  return ['Total', duration, tokens ? `· ${tokens}` : ''].filter(Boolean).join(' ');
}

export function isRunMetricsRowExpanded(
  state: QueueRunMetricsDisclosureState,
  mode: QueueSurfaceMode,
  rowId: string
): boolean {
  return state.expandedByMode[mode]
    ? !state.collapsedRows.has(rowId)
    : state.expandedRows.has(rowId);
}

export function hasExpandedRunMetricsRows(
  state: QueueRunMetricsDisclosureState,
  mode: QueueSurfaceMode,
  rowIds: string[]
): boolean {
  return rowIds.some(rowId => isRunMetricsRowExpanded(state, mode, rowId));
}

export function toggleRunMetricsRowExpansion(
  state: QueueRunMetricsDisclosureState,
  mode: QueueSurfaceMode,
  rowId: string
): QueueRunMetricsDisclosureState {
  const expandedRows = new Set(state.expandedRows);
  const collapsedRows = new Set(state.collapsedRows);

  if (state.expandedByMode[mode]) {
    if (collapsedRows.has(rowId)) collapsedRows.delete(rowId);
    else collapsedRows.add(rowId);
  } else if (expandedRows.has(rowId)) {
    expandedRows.delete(rowId);
  } else {
    expandedRows.add(rowId);
  }

  return {
    expandedByMode: { ...state.expandedByMode },
    expandedRows,
    collapsedRows,
  };
}

export function toggleRunMetricsModeExpansion(
  state: QueueRunMetricsDisclosureState,
  mode: QueueSurfaceMode,
  visibleRowIds: string[]
): QueueRunMetricsDisclosureState {
  const hasExpandedRows = hasExpandedRunMetricsRows(state, mode, visibleRowIds);
  return {
    expandedByMode: {
      ...state.expandedByMode,
      [mode]: !hasExpandedRows,
    },
    expandedRows: new Set(),
    collapsedRows: new Set(),
  };
}
