import type {
  BatchAnkiExportItem,
  BatchAnkiItemStatus,
  BatchAnkiProgress,
  BatchAnkiProgressPhase,
} from '@/types/anki';

export const updateBatchItemsResolution = (
  items: BatchAnkiExportItem[],
  action: 'skip' | 'overwrite'
): BatchAnkiExportItem[] => {
  return items.map(item => {
    if (item.status !== 'duplicate' || !item.conflict) return item;
    return {
      ...item,
      resolution: action,
    };
  });
};

export const getImportableBatchItems = (items: BatchAnkiExportItem[]): BatchAnkiExportItem[] => {
  return items.filter(item => {
    if (item.preflightDuplicateState === 'ready' && item.status === 'ready') return true;
    if (
      item.preflightDuplicateState === 'duplicate' &&
      item.status === 'duplicate' &&
      item.resolution !== 'undecided'
    ) {
      return true;
    }
    return false;
  });
};

export const createBatchProgress = (
  phase: BatchAnkiProgressPhase,
  total: number
): BatchAnkiProgress => ({
  phase,
  processed: 0,
  total,
  percent: total > 0 ? 0 : 100,
});

export const stepBatchProgress = (progress: BatchAnkiProgress): BatchAnkiProgress => {
  const processed = Math.min(progress.total, progress.processed + 1);
  return {
    ...progress,
    processed,
    percent: progress.total > 0 ? Math.round((processed / progress.total) * 100) : 100,
  };
};

export const summarizeBatchStatuses = (
  items: BatchAnkiExportItem[]
): Record<BatchAnkiItemStatus, number> => {
  const initial: Record<BatchAnkiItemStatus, number> = {
    pending: 0,
    checking: 0,
    duplicate: 0,
    ready: 0,
    importing: 0,
    imported: 0,
    skipped: 0,
    cancelled: 0,
    overwritten: 0,
    failed: 0,
  };
  return items.reduce((acc, item) => {
    acc[item.status] += 1;
    return acc;
  }, initial);
};

export const markPendingItemsCancelled = (
  items: BatchAnkiExportItem[],
  allowedStatuses: BatchAnkiItemStatus[]
): BatchAnkiExportItem[] => {
  const statusSet = new Set(allowedStatuses);
  return items.map(item => {
    if (!statusSet.has(item.status)) return item;
    return {
      ...item,
      status: 'cancelled',
    };
  });
};
