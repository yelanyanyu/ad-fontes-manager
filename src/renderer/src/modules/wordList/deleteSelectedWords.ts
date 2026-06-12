import type { WordRecord } from '@/types/word-list';

export interface BulkDeleteConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger';
  requiredText: string;
  requiredTextLabel: string;
  requiredTextPlaceholder: string;
}

export interface DeleteSelectedWordsDependencies {
  getSelectedRecords: () => WordRecord[];
  requestConfirm: (options: BulkDeleteConfirmOptions) => Promise<boolean>;
  deleteWords: (ids: string[]) => Promise<void>;
  clearSelection: () => void;
}

export interface DeleteSelectedWordsResult {
  status: 'deleted' | 'empty' | 'cancelled';
  count: number;
}

export function getDeletableWordIds(records: WordRecord[]): string[] {
  return records
    .filter(record => !record.isLocal)
    .map(record => String(record.id || ''))
    .filter(Boolean);
}

export function buildBulkDeleteConfirmOptions(count: number): BulkDeleteConfirmOptions {
  const requiresTypedConfirm = count > 20;
  return {
    title: `Delete ${count} selected words?`,
    message: 'This permanently removes the selected words from the database.',
    confirmLabel: 'Delete Words',
    variant: 'danger',
    requiredText: requiresTypedConfirm ? '确认删除' : '',
    requiredTextLabel: requiresTypedConfirm ? '输入“确认删除”以继续。' : '',
    requiredTextPlaceholder: requiresTypedConfirm ? '确认删除' : '',
  };
}

export async function deleteSelectedWords({
  getSelectedRecords,
  requestConfirm,
  deleteWords,
  clearSelection,
}: DeleteSelectedWordsDependencies): Promise<DeleteSelectedWordsResult> {
  const ids = getDeletableWordIds(getSelectedRecords());
  if (!ids.length) return { status: 'empty', count: 0 };

  const confirmed = await requestConfirm(buildBulkDeleteConfirmOptions(ids.length));
  if (!confirmed) return { status: 'cancelled', count: ids.length };

  await deleteWords(ids);
  clearSelection();
  return { status: 'deleted', count: ids.length };
}
