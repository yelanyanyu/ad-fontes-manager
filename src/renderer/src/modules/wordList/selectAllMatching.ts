import {
  buildSelectAllMatchingDecision,
  collectAllDbMatchingRecords,
  mergeRecordsIntoSelectionMap,
  type SelectAllMatchingPageResult,
} from '@/services/selectAllMatchingService';
import type { WordRecord } from '@/types/word-list';

export type WordListToastType = 'success' | 'error' | 'warning' | 'info';

export interface SelectAllMatchingConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
}

export interface SelectAllMatchingWordsDependencies {
  getDbTotal: () => number;
  getExistingSelection: () => Map<string, WordRecord>;
  fetchPage: (page: number, limit: number) => Promise<SelectAllMatchingPageResult>;
  requestConfirm: (options: SelectAllMatchingConfirmOptions) => Promise<boolean>;
  replaceSelectionMap: (nextItems: Map<string, WordRecord>) => void;
  addToast: (message: string, type: WordListToastType) => void;
  pageLimit?: number;
}

export interface SelectAllMatchingWordsResult {
  status: 'selected' | 'empty' | 'cancelled';
  total: number;
}

export async function selectAllMatchingWords({
  getDbTotal,
  getExistingSelection,
  fetchPage,
  requestConfirm,
  replaceSelectionMap,
  addToast,
  pageLimit = 200,
}: SelectAllMatchingWordsDependencies): Promise<SelectAllMatchingWordsResult> {
  const dbTotal = getDbTotal();
  const decision = buildSelectAllMatchingDecision(dbTotal, 0);

  if (decision.total <= 0) {
    addToast('No matching words found', 'info');
    return { status: 'empty', total: 0 };
  }

  if (decision.requiresConfirm) {
    const confirmed = await requestConfirm({
      title: 'Select all matching words?',
      message: `This will select ${decision.total} words and may take longer to process.`,
      confirmLabel: 'Select All',
    });
    if (!confirmed) return { status: 'cancelled', total: decision.total };
  }

  const dbMatched = dbTotal > 0 ? await collectAllDbMatchingRecords(fetchPage, pageLimit) : [];
  const mergedMap = mergeRecordsIntoSelectionMap(getExistingSelection(), dbMatched);
  replaceSelectionMap(mergedMap);
  addToast(`Selected ${decision.total} matching words`, 'success');
  return { status: 'selected', total: decision.total };
}
