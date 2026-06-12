<script setup lang="ts">
/**
 * @file WordList.vue
 * @description 词条列表组件
 *
 * @component WordList
 * @description 提供词条列表展示、搜索、排序、分页和同步功能的综合组件
 *
 * @author Ad Fontes Team
 *
 * @features
 * - 列表展示：支持本地和数据库词条的统一展示
 * - 搜索功能：支持部分匹配和精确匹配两种搜索模式
 * - 排序功能：支持按字母顺序(A-Z/Z-A)、创建时间和修改时间排序
 * - 分页功能：支持自定义每页显示数量和页码跳转
 * - 同步功能：支持单个词条同步和批量同步，包含冲突检测和解决机制
 *
 * @dependencies
 * - Vue 3 (ref, computed, onMounted, watch, onActivated)
 * - Pinia (useWordStore, useAppStore, storeToRefs)
 * - js-yaml (YAML 解析和格式化)
 * - @/utils/request (HTTP 请求工具)
 * - @/utils/conflict (冲突检测和格式化工具)
 * - @/utils/search (搜索工具函数)
 * - ConflictModal (冲突解决弹窗组件)
 */

import { ref, computed, onMounted, watch, onActivated } from 'vue';
import type { Ref } from 'vue';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import { useAppStore } from '@/stores/appStore';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import WordActionMenu from '@/components/WordList/WordActionMenu.vue';
import DeleteConfirmModal from '@/components/WordList/DeleteConfirmModal.vue';
import BatchSyncModal from '@/components/WordList/BatchSyncModal.vue';
import AnkiExportModal from '@/components/AnkiExport/AnkiExportModal.vue';
import BatchAnkiExportModal from '@/components/AnkiExport/BatchAnkiExportModal.vue';
import BatchAnkiSummaryBar from '@/components/WordList/BatchAnkiSummaryBar.vue';
import WordListTable from '@/components/WordList/WordListTable.vue';
import WordListToolbar from '@/components/WordList/WordListToolbar.vue';
import WordListPagination from '@/components/WordList/WordListPagination.vue';
import WordImportReviewModal from '@/components/WordList/WordImportReviewModal.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import request from '@/utils/request';
import { normalizeSearchInput, isBlankSearch, filterRecordsBySearch } from '@/utils/search';
import { isSortMode } from '@/utils/sortMode';
import { useWordEditorLoader } from '@/composables/useWordEditorLoader';
import { useAnkiExport } from '@/composables/useAnkiExport';
import { useBatchAnkiExport } from '@/composables/useBatchAnkiExport';
import { useConfirmDialog } from '@/composables/useConfirmDialog';
import { useWordListColumns } from '@/composables/useWordListColumns';
import { useWordListSelection } from '@/composables/useWordListSelection';
import { buildWordExportFile, downloadWordExportFile } from '@/services/wordExportService';
import {
  importWordExportFile,
  parseWordImportFile,
  resolveWordImportConflicts,
  type WordImportConflict,
  type WordImportConflictAction,
} from '@/services/wordImportService';
import type { SelectAllMatchingPageResult } from '@/services/selectAllMatchingService';
import { selectAllMatchingWords } from '@/modules/wordList/selectAllMatching';
import { deleteSelectedWords as deleteSelectedWordRecords } from '@/modules/wordList/deleteSelectedWords';
import type {
  DbListMeta,
  DiffBadge,
  SearchMode,
  SortMode,
  SyncActionMap,
  SyncCheckItem,
  SyncConflict,
  WordRecord,
} from '@/types/word-list';

interface WordStoreLike {
  dbRecords: WordRecord[];
  dbListMeta: DbListMeta;
  loading: boolean;
  fetchDbRecords: (params?: Partial<DbListMeta> & { background?: boolean }) => Promise<void>;
  deleteWord: (id: string) => Promise<void>;
  deleteWords: (ids: string[]) => Promise<void>;
  loadEditorSession: (session: {
    yaml: string;
    context: {
      id: string | null;
      wordSchemaVersion?: number | null;
      isLatestSchema?: boolean | null;
    };
  }) => void;
}

interface AppStoreLike {
  currentLanguage: string;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface WordListApiResponse {
  items?: WordRecord[];
  page?: number;
  totalPages?: number;
}

const wordStore = useWordStore() as unknown as WordStoreLike;
const appStore = useAppStore() as unknown as AppStoreLike;
const { dbRecords, dbListMeta, loading } = storeToRefs(wordStore as any) as {
  dbRecords: Ref<WordRecord[]>;
  dbListMeta: Ref<DbListMeta>;
  loading: Ref<boolean>;
};

/**
 * @description 搜索关键词
 * @type {Ref<string>}
 * @default ''
 * @remarks 用户输入的搜索关键词，用于过滤词条列表
 */
const search = ref<string>('');

/**
 * @description 排序方式
 * @type {Ref<SortMode>}
 * @default 'updated-newest'
 * @remarks 控制词条列表的排序方式：
 * - 'az': 按词条字母升序排列
 * - 'za': 按词条字母降序排列
 * - 'updated-newest': 按修改时间降序排列（最近修改的在前）
 * - 'updated-oldest': 按修改时间升序排列（最久未修改的在前）
 * - 'newest': 按创建时间降序排列（最近添加的在前）
 * - 'oldest': 按创建时间升序排列（最早添加的在前）
 */
const sort = ref<SortMode>('updated-newest');

/**
 * @description 每页显示数量
 * @type {Ref<number>}
 * @default 20
 * @remarks 控制每页显示的词条数量，范围 1-500
 */
const pageSize = ref<number>(20);

const searchMode = ref<SearchMode>('partial');
const searchModeOpen = ref<boolean>(false);
const searchModeStorageKey = 'word_search_mode';

// Sync meta from store to local refs if needed, or just use store actions
watch(dbListMeta, (meta: DbListMeta) => {
  if (meta.search !== search.value) search.value = meta.search;
  if (meta.sort !== sort.value) sort.value = meta.sort;
  if (meta.limit !== pageSize.value) pageSize.value = meta.limit;
});

/**
 * @description 总记录数
 * @type {ComputedRef<number>}
 * @returns {number} 词条总数量
 * @remarks 根据连接状态返回不同来源的总数：
 * - 后端连接正常时：返回数据库中的总记录数
 * - 后端断开时：返回本地记录数量
 */
const totalCount = computed(() => {
  return dbListMeta.value.total || 0;
});

/**
 * @description 过滤后的显示记录
 * @type {ComputedRef<Array>}
 * @returns {Array} 经过搜索过滤后的词条列表
 * @remarks 合并本地记录和数据库记录，并根据搜索关键词进行过滤：
 * - 本地记录会标记 isLocal: true
 * - 使用 filterRecordsBySearch 函数根据搜索模式和关键词过滤
 */
const displayedRecords = computed<WordRecord[]>(() => {
  return filterRecordsBySearch(dbRecords.value || [], search.value, searchMode.value);
});

const selectingAllMatching = ref(false);
const exportingWords = ref(false);
const importingWords = ref(false);
const deletingWords = ref(false);
const wordImportInput = ref<HTMLInputElement | null>(null);
const wordImportReviewOpen = ref(false);
const wordImportImportedCount = ref(0);
const wordImportFailedCount = ref(0);
const wordImportConflicts = ref<WordImportConflict[]>([]);
const {
  dialog: selectAllMatchingConfirmDialog,
  requestConfirm: requestSelectAllMatchingConfirm,
  settleConfirm: settleSelectAllMatchingConfirm,
} = useConfirmDialog();
const {
  dialog: batchCancelConfirmDialog,
  requestConfirm: requestBatchCancelConfirm,
  settleConfirm: settleBatchCancelConfirm,
} = useConfirmDialog();
const {
  dialog: bulkDeleteConfirmDialog,
  requestConfirm: requestBulkDeleteConfirm,
  settleConfirm: settleBulkDeleteConfirm,
} = useConfirmDialog();

const {
  allColumnKeys,
  columnLabels,
  columnMenuOpen,
  visibleColumns,
  shownColumns,
  toggleColumn,
  formatColValue,
} = useWordListColumns();
const {
  selectedItemsByKey,
  selectedCount,
  hasSelection,
  selectedExportRecords,
  isAllVisibleSelected,
  clearSelection,
  isSelected,
  toggleSelection,
  toggleSelectAllVisible,
  replaceSelectionMap,
} = useWordListSelection(displayedRecords);
const showBatchSummaryBar = computed<boolean>(() => {
  return (
    batchAnkiHasActiveTask.value &&
    (batchAnkiSummaryVisible.value ||
      batchAnkiProgress.value.phase !== 'idle' ||
      batchAnkiBusy.value)
  );
});

const emit = defineEmits<{
  (e: 'preview', id: string): void;
  (e: 'edit', id: string): void;
}>();

const handlePreview = (id: string): void => {
  emit('preview', id);
};

const handleEdit = (id: string): void => {
  void loadIntoEditor(id);
};

const showMenuId = ref<string | null>(null);
const pendingDelete = ref<{ id: string } | null>(null);

const getDiffBadges = (diffs: unknown[] | undefined): DiffBadge[] =>
  deepDiffAdapter.getBadges(diffs as any) as DiffBadge[];
const searchModeLabel = computed(() =>
  searchMode.value === 'exact' ? 'Exact Match' : 'Partial Match'
);

const toggleMenu = (id: string): void => {
  if (showMenuId.value === id) {
    showMenuId.value = null;
  } else {
    showMenuId.value = id;
  }
};

const selectedMenuItem = computed<WordRecord | null>(() => {
  if (!showMenuId.value) return null;
  return displayedRecords.value.find(r => r.id === showMenuId.value) || null;
});

const openDelete = (id: string | { id: string }): void => {
  pendingDelete.value = { id: typeof id === 'string' ? id : id.id };
  showMenuId.value = null;
};

const cancelDelete = (): void => {
  pendingDelete.value = null;
};

const confirmDelete = async () => {
  if (!pendingDelete.value) return;
  await wordStore.deleteWord(pendingDelete.value.id);
  pendingDelete.value = null;
  clearSelection();
};

const {
  isOpen: ankiExportOpen,
  busy: ankiExportBusy,
  error: ankiExportError,
  payload: ankiExportPayload,
  duplicateConflict: ankiDuplicateConflict,
  ankiConnected: ankiConnected,
  deckOptions: ankiDeckOptions,
  modelOptions: ankiModelOptions,
  modelFieldNames: ankiModelFieldNames,
  templateOptions: ankiTemplateOptions,
  deckName: ankiDeckName,
  modelName: ankiModelName,
  templateName: ankiTemplateName,
  tagsInput: ankiTagsInput,
  apkgPath: ankiApkgPath,
  fieldMapping: ankiFieldMapping,
  open: openAnkiExport,
  close: closeAnkiExport,
  connectAnki: connectAnkiExport,
  browseApkgPath: browseAnkiApkgPath,
  updateFieldMapping: updateAnkiFieldMapping,
  updateAndRefresh: refreshAnkiExportPayload,
  importToAnki,
  exportApkg,
} = useAnkiExport();

const handleExport = async (): Promise<void> => {
  const selected = selectedMenuItem.value;
  if (!selected) return;
  showMenuId.value = null;
  await openAnkiExport(selected);
};

const handleImportToAnki = async (): Promise<void> => {
  try {
    const result = await importToAnki();
    if (result.status === 'conflict') {
      appStore.addToast('检测到重复单词，请选择覆盖或跳过。', 'warning');
      return;
    }
    if (result.status === 'skipped') {
      appStore.addToast('Skipped duplicate note.', 'info');
      return;
    }
    if (result.status === 'overwritten') {
      appStore.addToast(`Updated existing Anki note (noteId: ${result.noteId})`, 'success');
      return;
    }
    appStore.addToast(`Imported to Anki successfully (noteId: ${result.noteId})`, 'success');
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to import to Anki', 'error');
  }
};

const handleExportApkg = async (): Promise<void> => {
  try {
    await exportApkg();
    appStore.addToast('.apkg exported successfully', 'success');
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to export .apkg', 'error');
  }
};

const handleConnectAnkiExport = async (): Promise<void> => {
  await connectAnkiExport(true);
};

const setAnkiDeckName = (value: string): void => {
  ankiDeckName.value = value;
};

const setAnkiModelName = (value: string): void => {
  ankiModelName.value = value;
};

const setAnkiTemplateName = (value: string): void => {
  ankiTemplateName.value = value;
};

const setAnkiTagsInput = (value: string): void => {
  ankiTagsInput.value = value;
};

const setAnkiApkgPath = (value: string): void => {
  ankiApkgPath.value = value;
};

const {
  isOpen: batchAnkiOpen,
  busy: batchAnkiBusy,
  error: batchAnkiError,
  items: batchAnkiItems,
  progress: batchAnkiProgress,
  progressLabel: batchAnkiProgressLabel,
  stageLabel: batchAnkiStageLabel,
  statusSummary: batchAnkiStatusSummary,
  duplicateImportDecisionOpen: batchAnkiDuplicateDecisionOpen,
  duplicateImportDecisionSummary: batchAnkiDuplicateDecisionSummary,
  hasActiveTask: batchAnkiHasActiveTask,
  canEditConfig: batchAnkiCanEditConfig,
  canCancel: batchAnkiCanCancel,
  canResume: batchAnkiCanResume,
  lastStoppedPhase: batchAnkiLastStoppedPhase,
  summaryVisible: batchAnkiSummaryVisible,
  ankiConnected: batchAnkiConnected,
  deckOptions: batchAnkiDeckOptions,
  modelOptions: batchAnkiModelOptions,
  modelFieldNames: batchAnkiModelFieldNames,
  templateOptions: batchAnkiTemplateOptions,
  deckName: batchAnkiDeckName,
  modelName: batchAnkiModelName,
  templateName: batchAnkiTemplateName,
  tagsInput: batchAnkiTagsInput,
  fieldMapping: batchAnkiFieldMapping,
  open: openBatchAnkiExportModal,
  close: closeBatchAnkiExportModal,
  reopenPanel: reopenBatchAnkiPanel,
  dismissSummary: dismissBatchAnkiSummary,
  connectAnki: connectBatchAnki,
  updateFieldMapping: updateBatchFieldMapping,
  cancelBatchOperation,
  checkDuplicates: checkBatchDuplicates,
  exportApkg: exportBatchApkg,
  importToAnki: importBatchToAnki,
  confirmDuplicateImportDecision,
  cancelDuplicateImportDecision,
  resumeBatchOperation,
  restartBatchOperation,
} = useBatchAnkiExport();

const openBatchAnkiExport = async (): Promise<void> => {
  const taskRunning = batchAnkiBusy.value || batchAnkiProgress.value.phase !== 'idle';
  if (batchAnkiHasActiveTask.value && taskRunning) {
    reopenBatchAnkiPanel();
    return;
  }
  if (batchAnkiHasActiveTask.value && !selectedExportRecords.value.length) {
    reopenBatchAnkiPanel();
    return;
  }
  if (!selectedExportRecords.value.length) {
    appStore.addToast('No selected words for batch export', 'warning');
    return;
  }
  await openBatchAnkiExportModal(selectedExportRecords.value);
};

const exportSelectedWords = (): void => {
  if (exportingWords.value) return;
  if (!selectedExportRecords.value.length) {
    appStore.addToast('Select words to export', 'warning');
    return;
  }

  exportingWords.value = true;
  try {
    const exportFile = buildWordExportFile(selectedExportRecords.value);
    const fileName = downloadWordExportFile(exportFile);
    appStore.addToast(`Exported ${exportFile.items.length} words to ${fileName}`, 'success');
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to export selected words', 'error');
  } finally {
    exportingWords.value = false;
  }
};

const deleteSelectedWords = async (): Promise<void> => {
  if (deletingWords.value) return;
  deletingWords.value = true;
  try {
    await deleteSelectedWordRecords({
      getSelectedRecords: () => selectedExportRecords.value,
      requestConfirm: requestBulkDeleteConfirm,
      deleteWords: wordStore.deleteWords,
      clearSelection,
    });
  } finally {
    deletingWords.value = false;
  }
};

const openWordImportPicker = (): void => {
  if (importingWords.value) return;
  wordImportInput.value?.click();
};

const summarizeWordImport = (result: Awaited<ReturnType<typeof importWordExportFile>>): string => {
  const parts = [`Imported ${result.imported}`];
  if (result.overwritten) parts.push(`overwrote ${result.overwritten}`);
  if (result.skippedConflicts) parts.push(`found ${result.skippedConflicts} conflicts`);
  if (result.skippedUnsupportedSchema) {
    parts.push(`skipped ${result.skippedUnsupportedSchema} incompatible`);
  }
  if (result.failed) parts.push(`failed ${result.failed}`);
  return `${parts.join(', ')} of ${result.total} words`;
};

const importWordsFromFile = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file || importingWords.value) return;

  importingWords.value = true;
  try {
    const rawJson = await file.text();
    const exportFile = parseWordImportFile(rawJson);
    const result = await importWordExportFile(exportFile);
    await wordStore.fetchDbRecords({ page: 1, background: true });
    wordImportImportedCount.value = result.imported;
    wordImportFailedCount.value = result.failed;
    wordImportConflicts.value = result.conflicts;
    if (result.conflicts.length) {
      wordImportReviewOpen.value = true;
      appStore.addToast(summarizeWordImport(result), result.failed ? 'warning' : 'info');
    } else {
      appStore.addToast(
        summarizeWordImport(result),
        result.failed ? 'warning' : result.imported ? 'success' : 'info'
      );
    }
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to import Word JSON', 'error');
  } finally {
    importingWords.value = false;
    if (input) input.value = '';
  }
};

const setWordImportConflictAction = (key: string, action: WordImportConflictAction): void => {
  wordImportConflicts.value = wordImportConflicts.value.map(conflict =>
    conflict.key === key ? { ...conflict, action } : conflict
  );
};

const resolveWordImportReview = async (): Promise<void> => {
  if (importingWords.value) return;
  importingWords.value = true;
  try {
    const result = await resolveWordImportConflicts(wordImportConflicts.value);
    wordImportImportedCount.value += result.overwritten;
    wordImportFailedCount.value += result.failed;
    await wordStore.fetchDbRecords({ page: 1, background: true });
    appStore.addToast(
      `Imported ${wordImportImportedCount.value}, skipped ${result.skippedConflicts}, failed ${wordImportFailedCount.value}`,
      result.failed ? 'warning' : 'success'
    );
    wordImportReviewOpen.value = false;
    wordImportConflicts.value = [];
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to resolve Word Import conflicts', 'error');
  } finally {
    importingWords.value = false;
  }
};

const resolveWordImportReviewMode = (action: WordImportConflictAction): void => {
  wordImportConflicts.value = wordImportConflicts.value.map(conflict => ({
    ...conflict,
    action,
  }));
  void resolveWordImportReview();
};

const setBatchDeckName = (value: string): void => {
  batchAnkiDeckName.value = value;
};

const setBatchModelName = (value: string): void => {
  batchAnkiModelName.value = value;
};

const setBatchTemplateName = (value: string): void => {
  batchAnkiTemplateName.value = value;
};

const setBatchTagsInput = (value: string): void => {
  batchAnkiTagsInput.value = value;
};

const handleBatchExportApkg = async (): Promise<void> => {
  try {
    await exportBatchApkg();
    appStore.addToast('Batch .apkg exported successfully', 'success');
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to export batch .apkg', 'error');
  }
};

const showBatchImportOutcomeToast = (
  result: Awaited<ReturnType<typeof importBatchToAnki>>
): void => {
  if (result.status === 'completed') {
    appStore.addToast('Batch import completed', 'success');
    return;
  }
  if (result.status === 'failed') {
    appStore.addToast(result.message || 'Failed to import batch to Anki', 'error');
    return;
  }
  if (result.status === 'cancelled') {
    appStore.addToast(result.message || 'Batch import cancelled', 'warning');
  }
};

const handleBatchImportToAnki = async (): Promise<void> => {
  try {
    const result = await importBatchToAnki();
    showBatchImportOutcomeToast(result);
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to import batch to Anki', 'error');
  }
};

const overwriteBatchDuplicatesAndImportAll = async (): Promise<void> => {
  try {
    const result = await confirmDuplicateImportDecision('overwrite');
    showBatchImportOutcomeToast(result);
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to import batch to Anki', 'error');
  }
};

const importOnlyNewBatchCards = async (): Promise<void> => {
  try {
    const result = await confirmDuplicateImportDecision('skip');
    showBatchImportOutcomeToast(result);
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to import batch to Anki', 'error');
  }
};

const openBatchPanelFromSummary = (): void => {
  reopenBatchAnkiPanel();
};

const cancelBatchFromSummary = async (): Promise<void> => {
  const confirmed = await requestBatchCancelConfirm({
    title: 'Cancel batch operation?',
    message: 'The current item will finish, then remaining items will stop.',
    confirmLabel: 'Cancel Batch',
    variant: 'danger',
  });
  if (!confirmed) return;
  cancelBatchOperation();
};

const resumeBatchFromSummary = async (): Promise<void> => {
  await resumeBatchOperation();
};

const handleCancelBatchOperation = async (): Promise<void> => {
  const confirmed = await requestBatchCancelConfirm({
    title: 'Cancel batch operation?',
    message: 'The current item will finish, then remaining items will stop.',
    confirmLabel: 'Cancel Batch',
    variant: 'danger',
  });
  if (!confirmed) return;
  cancelBatchOperation();
};

const closeBatchSummary = (): void => {
  dismissBatchAnkiSummary();
};

const fetchDbPageForSelection = async (
  page: number,
  limit: number
): Promise<SelectAllMatchingPageResult> => {
  const response = await request.get<WordListApiResponse>('/v2/words', {
    params: {
      page,
      limit,
      search: dbListMeta.value.search || '',
      sort: dbListMeta.value.sort || sort.value,
    },
    skipErrorToast: true,
  });

  return {
    items: response.items || [],
    page: Number(response.page || page),
    totalPages: Number(response.totalPages || 1),
  };
};

const selectAllMatching = async (): Promise<void> => {
  if (selectingAllMatching.value) return;
  selectingAllMatching.value = true;

  try {
    await selectAllMatchingWords({
      getDbTotal: () => dbListMeta.value.total || 0,
      getExistingSelection: () => selectedItemsByKey.value,
      fetchPage: fetchDbPageForSelection,
      requestConfirm: requestSelectAllMatchingConfirm,
      replaceSelectionMap,
      addToast: (message, type) => appStore.addToast(message, type),
    });
  } catch (error) {
    const err = error as { message?: string };
    appStore.addToast(err.message || 'Failed to select all matching words', 'error');
  } finally {
    selectingAllMatching.value = false;
  }
};

const previewBatchWord = (wordId: string): void => {
  closeBatchAnkiExportModal();
  handlePreview(wordId);
};

const refresh = async () => {
  clearSelection();
  await wordStore.fetchDbRecords();
};

const { loadIntoEditor } = useWordEditorLoader({
  displayedRecords,
  wordStore,
});

const {
  syncAllOpen,
  syncAllLoading,
  syncChecks,
  syncActions,
  syncConflict,
  syncConflictTitle,
  openSyncAll,
  closeSyncAll,
  setBatchAction,
  executeBatchSync,
  syncOne,
  closeSyncConflict,
  editLocalFromSyncConflict,
  overwriteSyncConflict,
} = {
  syncAllOpen: ref(false),
  syncAllLoading: ref(false),
  syncChecks: ref<SyncCheckItem[]>([]),
  syncActions: ref<SyncActionMap>({}),
  syncConflict: ref<SyncConflict | null>(null),
  syncConflictTitle: 'Sync Conflict',
  openSyncAll: () => undefined,
  closeSyncAll: () => undefined,
  setBatchAction: (_: string, __: string) => undefined,
  executeBatchSync: async () => undefined,
  syncOne: async (_: any) => undefined,
  closeSyncConflict: () => undefined,
  editLocalFromSyncConflict: () => undefined,
  overwriteSyncConflict: async () => undefined,
};

onMounted(() => {
  const storedMode = localStorage.getItem(searchModeStorageKey);
  if (storedMode === 'exact' || storedMode === 'partial') {
    searchMode.value = storedMode;
  }
  void refresh();
});

onActivated(() => {
  void refresh();
});
watch(searchMode, value => {
  localStorage.setItem(searchModeStorageKey, value);
});

// Auto-refresh list when language changes
watch(
  () => appStore.currentLanguage,
  () => {
    void wordStore.fetchDbRecords({ page: 1, language: appStore.currentLanguage });
  }
);
const canSearch = computed(() => {
  return !loading.value;
});

/**
 * @description 执行搜索
 * @async
 * @function handleSearch
 * @returns {Promise<void>}
 * @remarks 处理搜索操作：
 * 1. 检查是否可以执行搜索（非加载状态）
 * 2. 规范化搜索输入
 * 3. 调用 wordStore.fetchDbRecords 获取搜索结果
 * @see {@link normalizeSearchInput} 搜索输入规范化函数
 * @see {@link isBlankSearch} 空白搜索检测函数
 */
const handleSearch = async () => {
  if (!canSearch.value) return;
  const normalized = normalizeSearchInput(search.value);
  const searchValue = isBlankSearch(normalized) ? '' : normalized;
  clearSelection();
  await wordStore.fetchDbRecords({ search: searchValue, page: 1 });
};

const handleSearchKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Enter') {
    e.preventDefault();
    void handleSearch();
  }
};

const updateSearch = (value: string): void => {
  search.value = value;
};

const clearSearch = async (): Promise<void> => {
  if (!canSearch.value) return;
  search.value = '';
  clearSelection();
  await wordStore.fetchDbRecords({ search: '', page: 1 });
};

const toggleSearchMode = () => {
  searchModeOpen.value = !searchModeOpen.value;
};

const closeSearchMode = () => {
  searchModeOpen.value = false;
};

const setSearchMode = (mode: SearchMode): void => {
  clearSelection();
  searchMode.value = mode;
  searchModeOpen.value = false;
};

const updateSort = (value: string): void => {
  if (isSortMode(value)) {
    sort.value = value;
  }
  clearSelection();
  handleSort();
};

const updatePageSize = (value: string): void => {
  const next = Number(value);
  pageSize.value = Number.isFinite(next) ? next : pageSize.value;
  clearSelection();
  handlePageSize();
};

const handleSort = () => {
  void wordStore.fetchDbRecords({ sort: sort.value, page: 1 });
};

const handlePageSize = () => {
  void wordStore.fetchDbRecords({ limit: pageSize.value, page: 1 });
};

/**
 * @description 翻页
 * @function changePage
 * @param {number} delta - 页码变化量（正数为下一页，负数为上一页）
 * @remarks 根据变化量切换页面：
 * - 检查新页码是否在有效范围内（1 到 totalPages）
 * - 调用 fetchDbRecords 获取新页面的数据
 */
const changePage = (delta: number): void => {
  const newPage = dbListMeta.value.page + delta;
  if (newPage >= 1 && newPage <= dbListMeta.value.totalPages) {
    void wordStore.fetchDbRecords({ page: newPage });
  }
};

/**
 * @description 跳转到指定页
 * @function goToPage
 * @param {number} page - 目标页码
 * @remarks 直接跳转到指定页码：
 * - 检查页码是否在有效范围内
 * - 调用 fetchDbRecords 获取目标页面的数据
 */
const goToPage = (page: number): void => {
  if (page >= 1 && page <= dbListMeta.value.totalPages) {
    void wordStore.fetchDbRecords({ page });
  }
};

const paginationRange = computed<Array<number | '...'>>(() => {
  const current = dbListMeta.value.page;
  const total = dbListMeta.value.totalPages;
  const delta = 2;
  const range: Array<number | '...'> = [];

  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i);
  }

  if (current - delta > 2) range.unshift('...');
  if (current + delta < total - 1) range.push('...');

  range.unshift(1);
  if (total > 1) range.push(total);

  return range;
});
</script>

<template>
  <div class="panel table-panel" :class="{ 'has-batch-summary': showBatchSummaryBar }">
    <ConfirmDialog
      v-bind="selectAllMatchingConfirmDialog"
      @cancel="settleSelectAllMatchingConfirm(false)"
      @confirm="settleSelectAllMatchingConfirm(true)"
    />
    <ConfirmDialog
      v-bind="batchCancelConfirmDialog"
      @cancel="settleBatchCancelConfirm(false)"
      @confirm="settleBatchCancelConfirm(true)"
    />
    <ConfirmDialog
      v-bind="bulkDeleteConfirmDialog"
      @cancel="settleBulkDeleteConfirm(false)"
      @confirm="settleBulkDeleteConfirm(true)"
    />
    <AnkiExportModal
      :open="ankiExportOpen"
      :busy="ankiExportBusy"
      :error="ankiExportError"
      :payload="ankiExportPayload"
      :duplicate-conflict="ankiDuplicateConflict"
      :anki-connected="ankiConnected"
      :deck-options="ankiDeckOptions"
      :model-options="ankiModelOptions"
      :model-field-names="ankiModelFieldNames"
      :template-options="ankiTemplateOptions"
      :deck-name="ankiDeckName"
      :model-name="ankiModelName"
      :template-name="ankiTemplateName"
      :tags-input="ankiTagsInput"
      :apkg-path="ankiApkgPath"
      :field-mapping="ankiFieldMapping"
      @close="closeAnkiExport"
      @connect-anki="handleConnectAnkiExport"
      @browse-apkg-path="browseAnkiApkgPath"
      @update:deck-name="setAnkiDeckName"
      @update:model-name="setAnkiModelName"
      @update:template-name="setAnkiTemplateName"
      @update:tags-input="setAnkiTagsInput"
      @update:apkg-path="setAnkiApkgPath"
      @update:field-mapping="updateAnkiFieldMapping"
      @refresh="refreshAnkiExportPayload"
      @import-test="handleImportToAnki"
      @export-apkg="handleExportApkg"
    />
    <BatchAnkiExportModal
      :open="batchAnkiOpen"
      :busy="batchAnkiBusy"
      :error="batchAnkiError"
      :items="batchAnkiItems"
      :progress="batchAnkiProgress"
      :progress-label="batchAnkiProgressLabel"
      :anki-connected="batchAnkiConnected"
      :deck-options="batchAnkiDeckOptions"
      :model-options="batchAnkiModelOptions"
      :model-field-names="batchAnkiModelFieldNames"
      :template-options="batchAnkiTemplateOptions"
      :deck-name="batchAnkiDeckName"
      :model-name="batchAnkiModelName"
      :template-name="batchAnkiTemplateName"
      :tags-input="batchAnkiTagsInput"
      :field-mapping="batchAnkiFieldMapping"
      :can-edit-config="batchAnkiCanEditConfig"
      :can-cancel="batchAnkiCanCancel"
      :can-resume="batchAnkiCanResume"
      :last-stopped-phase="batchAnkiLastStoppedPhase"
      :duplicate-decision-open="batchAnkiDuplicateDecisionOpen"
      :duplicate-decision-summary="batchAnkiDuplicateDecisionSummary"
      @close="closeBatchAnkiExportModal"
      @return="closeBatchAnkiExportModal"
      @connect-anki="connectBatchAnki(true)"
      @update:deck-name="setBatchDeckName"
      @update:model-name="setBatchModelName"
      @update:template-name="setBatchTemplateName"
      @update:tags-input="setBatchTagsInput"
      @update:field-mapping="updateBatchFieldMapping"
      @check-duplicates="checkBatchDuplicates"
      @export-apkg="handleBatchExportApkg"
      @import-to-anki="handleBatchImportToAnki"
      @overwrite-duplicates-and-import-all="overwriteBatchDuplicatesAndImportAll"
      @import-only-new-cards="importOnlyNewBatchCards"
      @cancel-duplicate-decision="cancelDuplicateImportDecision"
      @cancel-operation="handleCancelBatchOperation"
      @resume-operation="resumeBatchOperation"
      @restart-operation="restartBatchOperation"
      @preview-word="previewBatchWord"
    />
    <WordActionMenu
      :open="showMenuId !== null"
      :item="selectedMenuItem"
      @close="showMenuId = null"
      @sync="syncOne"
      @export="void handleExport()"
      @delete="openDelete"
    />
    <DeleteConfirmModal :open="!!pendingDelete" @cancel="cancelDelete" @confirm="confirmDelete" />
    <BatchSyncModal
      :open="syncAllOpen"
      :loading="syncAllLoading"
      :checks="syncChecks"
      :actions="syncActions"
      :get-diff-badges="getDiffBadges"
      @close="closeSyncAll"
      @set-action="setBatchAction"
      @sync="executeBatchSync"
    />
    <ConflictModal
      :open="!!syncConflict"
      :title="syncConflictTitle"
      :diff="syncConflict?.diff || []"
      :left-data="syncConflict?.oldData || {}"
      :right-data="syncConflict?.newData || {}"
      left-label="DB"
      right-label="LOCAL"
      primary-label="Overwrite"
      secondary-label="Cancel"
      tertiary-label="Edit Local"
      :formatter="yamlFormatter"
      :diff-adapter="deepDiffAdapter"
      @close="closeSyncConflict"
      @secondary="closeSyncConflict"
      @tertiary="editLocalFromSyncConflict"
      @primary="overwriteSyncConflict"
    />
    <WordListToolbar
      :search="search"
      :loading="loading"
      :can-search="canSearch"
      :search-mode="searchMode"
      :search-mode-open="searchModeOpen"
      :search-mode-label="searchModeLabel"
      :sort="sort"
      :page-size="pageSize"
      :is-backend-connected="true"
      :local-sync-count="0"
      :total-count="totalCount"
      :sync-all-loading="syncAllLoading"
      :selected-count="selectedCount"
      :has-selection="hasSelection"
      :selecting-all-matching="selectingAllMatching"
      :exporting-words="exportingWords"
      :importing-words="importingWords"
      :deleting-words="deletingWords"
      @update-search="updateSearch"
      @clear-search="clearSearch"
      @search="handleSearch"
      @search-keydown="handleSearchKeydown"
      @toggle-search-mode="toggleSearchMode"
      @close-search-mode="closeSearchMode"
      @set-search-mode="setSearchMode"
      @sort-change="updateSort"
      @page-size-change="updatePageSize"
      @open-sync-all="openSyncAll"
      @clear-selection="clearSelection"
      @select-all-matching="void selectAllMatching()"
      @export-selected-words="exportSelectedWords"
      @import-words="openWordImportPicker"
      @delete-selected-words="void deleteSelectedWords()"
      @open-batch-anki-export="void openBatchAnkiExport()"
    />
    <input
      ref="wordImportInput"
      class="word-import-input"
      type="file"
      accept=".json,application/json"
      @change="importWordsFromFile"
    />
    <WordImportReviewModal
      :open="wordImportReviewOpen"
      :conflicts="wordImportConflicts"
      :busy="importingWords"
      :imported-count="wordImportImportedCount"
      :failed-count="wordImportFailedCount"
      @close="wordImportReviewOpen = false"
      @set-action="setWordImportConflictAction"
      @resolve="resolveWordImportReview"
      @resolve-mode="resolveWordImportReviewMode"
    />
    <BatchAnkiSummaryBar
      v-if="showBatchSummaryBar"
      :stage-label="batchAnkiStageLabel"
      :progress="batchAnkiProgress"
      :status-summary="batchAnkiStatusSummary"
      :busy="batchAnkiBusy"
      :can-cancel="batchAnkiCanCancel"
      :can-resume="batchAnkiCanResume"
      :last-stopped-phase="batchAnkiLastStoppedPhase"
      @open="openBatchPanelFromSummary"
      @cancel="cancelBatchFromSummary"
      @resume="void resumeBatchFromSummary()"
      @close="closeBatchSummary"
    />

    <WordListTable
      :loading="loading"
      :records="displayedRecords"
      :shown-columns="shownColumns"
      :all-column-keys="allColumnKeys"
      :column-labels="columnLabels"
      :visible-columns="visibleColumns"
      :column-menu-open="columnMenuOpen"
      :all-visible-selected="isAllVisibleSelected"
      :is-selected="isSelected"
      :format-col-value="formatColValue"
      @toggle-select-all="toggleSelectAllVisible"
      @toggle-selection="toggleSelection"
      @toggle-column="toggleColumn"
      @toggle-column-menu="columnMenuOpen = !columnMenuOpen"
      @refresh="refresh"
      @preview="handlePreview"
      @edit="handleEdit"
      @menu="toggleMenu"
    />
    <WordListPagination
      :page="dbListMeta.page"
      :total-pages="dbListMeta.totalPages"
      :pagination-range="paginationRange"
      @prev="changePage(-1)"
      @next="changePage(1)"
      @go-to="goToPage"
    />
  </div>
</template>

<style scoped>
/* Panel container */
.panel {
  min-height: 0;
  overflow: hidden;
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  flex: 1;
}

.table-panel {
  display: grid;
  grid-template-rows: auto 1fr 48px;
  min-height: 0;
}

.table-panel.has-batch-summary {
  grid-template-rows: auto auto minmax(0, 1fr) 48px;
}

.word-import-input {
  display: none;
}
</style>
