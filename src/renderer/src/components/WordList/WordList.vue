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
 * - 排序功能：支持按字母顺序(A-Z/Z-A)和时间顺序(最新/最旧)排序
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
import WordActionMenu from '@/components/WordList/WordActionMenu.vue';
import DeleteConfirmModal from '@/components/WordList/DeleteConfirmModal.vue';
import BatchSyncModal from '@/components/WordList/BatchSyncModal.vue';
import AnkiExportModal from '@/components/AnkiExport/AnkiExportModal.vue';
import BatchAnkiExportModal from '@/components/AnkiExport/BatchAnkiExportModal.vue';
import WordListToolbar from '@/components/WordList/WordListToolbar.vue';
import WordListPagination from '@/components/WordList/WordListPagination.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import request from '@/utils/request';
import { normalizeSearchInput, isBlankSearch, filterRecordsBySearch } from '@/utils/search';
import {
  addVisibleSelections,
  getSelectedLemmas,
  isWordSelected,
  makeWordSelectionKey,
  removeVisibleSelections,
} from '@/utils/wordSelection';
import { useWordEditorLoader } from '@/composables/useWordEditorLoader';
import { useAnkiExport } from '@/composables/useAnkiExport';
import { useBatchAnkiExport } from '@/composables/useBatchAnkiExport';
import {
  buildSelectAllMatchingDecision,
  collectAllDbMatchingRecords,
  mergeRecordsIntoSelectionMap,
  type SelectAllMatchingPageResult,
} from '@/services/selectAllMatchingService';
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
  setEditorYaml: (yaml: string) => void;
  setEditingContext: (context: { id: string | null }) => void;
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
 * @type {Ref<'az' | 'za' | 'newest' | 'oldest'>}
 * @default 'newest'
 * @remarks 控制词条列表的排序方式：
 * - 'az': 按词条字母升序排列
 * - 'za': 按词条字母降序排列
 * - 'newest': 按创建时间降序排列（最新的在前）
 * - 'oldest': 按创建时间升序排列（最旧的在前）
 */
const sort = ref<SortMode>('newest');

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

const selectedKeys = ref<Set<string>>(new Set());
const selectedItemsByKey = ref<Map<string, WordRecord>>(new Map());
const selectingAllMatching = ref(false);

// ----- Column visibility -----
type ColumnKey = 'language' | 'partOfSpeech' | 'revisionCount' | 'createdAt' | 'updatedAt';
const columnLabels: Record<ColumnKey, string> = {
  language: 'Lang',
  partOfSpeech: 'PoS',
  revisionCount: 'Rev',
  createdAt: 'Created',
  updatedAt: 'Updated',
};
const visibleColumns = ref<Record<ColumnKey, boolean>>({
  language: false,
  partOfSpeech: false,
  revisionCount: false,
  createdAt: false,
  updatedAt: false,
});
const columnMenuOpen = ref(false);
const allColumnKeys: ColumnKey[] = [
  'language',
  'partOfSpeech',
  'revisionCount',
  'createdAt',
  'updatedAt',
];
const shownColumns = computed<ColumnKey[]>(() =>
  allColumnKeys.filter(k => visibleColumns.value[k])
);
const toggleColumn = (key: ColumnKey) => {
  visibleColumns.value[key] = !visibleColumns.value[key];
};
const formatColValue = (item: WordRecord, key: ColumnKey): string => {
  switch (key) {
    case 'language':
      return (item as any).language || '';
    case 'partOfSpeech':
      return (item as any).part_of_speech || '';
    case 'revisionCount':
      return String((item as any).revision_count ?? '');
    case 'createdAt':
      return (item as any).created_at?.substring(0, 10) || '';
    case 'updatedAt':
      return (item as any).updated_at?.substring(0, 10) || '';
  }
};
const selectedCount = computed<number>(() => selectedKeys.value.size);
const hasSelection = computed<boolean>(() => selectedCount.value > 0);
const selectedExportRecords = computed<WordRecord[]>(() => [...selectedItemsByKey.value.values()]);
const visibleSelectedCount = computed<number>(() => {
  return displayedRecords.value.filter(item => isWordSelected(selectedKeys.value, item)).length;
});
const selectedLemmas = computed<string[]>(() => {
  return getSelectedLemmas([...selectedItemsByKey.value.values()]);
});
const isAllVisibleSelected = computed<boolean>(() => {
  return (
    displayedRecords.value.length > 0 &&
    visibleSelectedCount.value === displayedRecords.value.length
  );
});
const showBatchSummaryBar = computed<boolean>(() => {
  return (
    batchAnkiHasActiveTask.value &&
    (batchAnkiSummaryVisible.value ||
      batchAnkiProgress.value.phase !== 'idle' ||
      batchAnkiBusy.value)
  );
});

const clearSelection = (): void => {
  if (selectedKeys.value.size > 0) {
    selectedKeys.value = new Set();
    selectedItemsByKey.value = new Map();
  }
};

const isSelected = (item: WordRecord): boolean => {
  return isWordSelected(selectedKeys.value, item);
};

const toggleSelection = (item: WordRecord): void => {
  const key = makeWordSelectionKey(item);
  const nextKeys = new Set(selectedKeys.value);
  const nextItems = new Map(selectedItemsByKey.value);
  if (nextKeys.has(key)) {
    nextKeys.delete(key);
    nextItems.delete(key);
  } else {
    nextKeys.add(key);
    nextItems.set(key, { ...item });
  }
  selectedKeys.value = nextKeys;
  selectedItemsByKey.value = nextItems;
};

const toggleSelectAllVisible = (): void => {
  if (!displayedRecords.value.length) return;
  const nextItems = new Map(selectedItemsByKey.value);
  if (isAllVisibleSelected.value) {
    selectedKeys.value = removeVisibleSelections(selectedKeys.value, displayedRecords.value);
    displayedRecords.value.forEach(item => {
      nextItems.delete(makeWordSelectionKey(item));
    });
    selectedItemsByKey.value = nextItems;
    return;
  }
  selectedKeys.value = addVisibleSelections(selectedKeys.value, displayedRecords.value);
  displayedRecords.value.forEach(item => {
    nextItems.set(makeWordSelectionKey(item), { ...item });
  });
  selectedItemsByKey.value = nextItems;
};

const printSelectedLemmas = (): void => {
  if (!selectedLemmas.value.length) return;
  console.log('Selected lemmas:', selectedLemmas.value);
};

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
  setDuplicatesResolutionAll,
  exportApkg: exportBatchApkg,
  importReadyItems: importBatchReadyItems,
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

const ignoreAllBatchDuplicates = (): void => {
  setDuplicatesResolutionAll('skip');
};

const overwriteAllBatchDuplicates = (): void => {
  setDuplicatesResolutionAll('overwrite');
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

const openBatchPanelFromSummary = (): void => {
  reopenBatchAnkiPanel();
};

const cancelBatchFromSummary = (): void => {
  const confirmed = window.confirm(
    'Cancel the current batch operation? The current item will finish, then remaining items will stop.'
  );
  if (!confirmed) return;
  cancelBatchOperation();
};

const resumeBatchFromSummary = async (): Promise<void> => {
  await resumeBatchOperation();
};

const handleCancelBatchOperation = (): void => {
  const confirmed = window.confirm(
    'Cancel the current batch operation? The current item will finish, then remaining items will stop.'
  );
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
    const dbTotal = dbListMeta.value.total || 0;
    const decision = buildSelectAllMatchingDecision(dbTotal, 0);

    if (decision.total <= 0) {
      appStore.addToast('No matching words found', 'info');
      return;
    }

    if (decision.requiresConfirm) {
      const confirmed = window.confirm(
        `You are about to select ${decision.total} words. This exceeds 150 and may take longer to process. Continue?`
      );
      if (!confirmed) return;
    }

    const dbMatched =
      dbTotal > 0 ? await collectAllDbMatchingRecords(fetchDbPageForSelection, 200) : [];
    const mergedMap = mergeRecordsIntoSelectionMap(selectedItemsByKey.value, [...dbMatched]);
    selectedItemsByKey.value = mergedMap;
    selectedKeys.value = new Set(mergedMap.keys());
    appStore.addToast(`Selected ${decision.total} matching words`, 'success');
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
  if (value === 'az' || value === 'za' || value === 'newest' || value === 'oldest') {
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
  <div
    class="panel table-panel"
    :class="{ 'has-batch-summary': showBatchSummaryBar }"
  >
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
      @close="closeBatchAnkiExportModal"
      @return="closeBatchAnkiExportModal"
      @connect-anki="connectBatchAnki(true)"
      @update:deck-name="setBatchDeckName"
      @update:model-name="setBatchModelName"
      @update:template-name="setBatchTemplateName"
      @update:tags-input="setBatchTagsInput"
      @update:field-mapping="updateBatchFieldMapping"
      @check-duplicates="checkBatchDuplicates"
      @ignore-all-duplicates="ignoreAllBatchDuplicates"
      @overwrite-all-duplicates="overwriteAllBatchDuplicates"
      @export-apkg="handleBatchExportApkg"
      @import-ready-items="importBatchReadyItems"
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
      @update-search="updateSearch"
      @search="handleSearch"
      @search-keydown="handleSearchKeydown"
      @toggle-search-mode="toggleSearchMode"
      @close-search-mode="closeSearchMode"
      @set-search-mode="setSearchMode"
      @sort-change="updateSort"
      @page-size-change="updatePageSize"
      @open-sync-all="openSyncAll"
      @refresh="refresh"
      @print-selected="printSelectedLemmas"
      @clear-selection="clearSelection"
      @select-all-matching="void selectAllMatching()"
      @open-batch-anki-export="void openBatchAnkiExport()"
    />
    <div
      v-if="showBatchSummaryBar"
      class="batch-summary-bar px-4 py-2 border-b border-[var(--line)] bg-[var(--surface-soft)]"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-xs font-semibold text-[var(--blue)] whitespace-nowrap">
            {{ batchAnkiStageLabel }}
          </span>
          <span class="text-xs text-[var(--text-soft)] whitespace-nowrap">
            {{ batchAnkiProgress.processed }}/{{ batchAnkiProgress.total }}
          </span>
          <div class="w-44 h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <div
              class="h-full bg-[var(--blue)] transition-all duration-300"
              :style="{ width: `${batchAnkiProgress.percent}%` }"
            />
          </div>
          <span class="text-xs text-[var(--muted)]">
            imported {{ batchAnkiStatusSummary.imported + batchAnkiStatusSummary.overwritten }},
            duplicate {{ batchAnkiStatusSummary.duplicate }}, failed
            {{ batchAnkiStatusSummary.failed }}, cancelled {{ batchAnkiStatusSummary.cancelled }}
          </span>
          <span
            v-if="batchAnkiCanResume && batchAnkiLastStoppedPhase"
            class="text-xs text-[var(--amber)] whitespace-nowrap"
          >
            Cancelled during {{ batchAnkiLastStoppedPhase }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
            @click="openBatchPanelFromSummary"
          >
            Open Batch Panel
          </button>
          <button
            v-if="batchAnkiCanCancel"
            class="text-xs px-2 py-1 rounded border border-[var(--red-border)] bg-[var(--surface)] text-[var(--red)] hover:bg-[var(--red-soft)]"
            @click="cancelBatchFromSummary"
          >
            Cancel
          </button>
          <button
            v-if="batchAnkiCanResume"
            class="text-xs px-2 py-1 rounded border border-[var(--blue-border)] bg-[var(--surface)] text-[var(--blue)] hover:bg-[var(--blue-soft)]"
            @click="void resumeBatchFromSummary()"
          >
            Resume
          </button>
          <button
            class="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)] disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="batchAnkiBusy || batchAnkiProgress.phase !== 'idle'"
            @click="closeBatchSummary"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <div
        v-if="loading && !displayedRecords.length"
        class="table-empty"
      >
        <svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4 31.4" />
        </svg>
        <span>Loading records...</span>
      </div>

      <div v-else class="table-wrap">
        <div class="table-shell">
          <div class="thead" :style="{ gridTemplateColumns: `34px 1fr ${shownColumns.map(() => 'auto').join(' ')} 122px` }">
            <div
              :class="['check', { selected: isAllVisibleSelected }]"
              role="checkbox"
              :aria-checked="isAllVisibleSelected"
              :aria-label="'Select all visible words'"
              @click="toggleSelectAllVisible"
            >
              <span v-if="isAllVisibleSelected">&#10003;</span>
            </div>
            <div>LEMMA</div>
            <div
              v-for="col in shownColumns"
              :key="col"
              class="thead-col"
            >
              {{ columnLabels[col] }}
            </div>
            <div class="right">
              <div class="ctl" style="height: 26px" @click.stop="columnMenuOpen = !columnMenuOpen">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                  <path d="M15 4v16" />
                  <path d="M3 10h18" />
                </svg>
                Columns
              </div>
              <div
                v-if="columnMenuOpen"
                class="column-menu"
                @click.stop
              >
                <label
                  v-for="col in allColumnKeys"
                  :key="col"
                  class="column-menu-item"
                >
                  <input
                    type="checkbox"
                    :checked="visibleColumns[col]"
                    @change="toggleColumn(col)"
                  />
                  {{ columnLabels[col] }}
                </label>
              </div>
            </div>
          </div>

          <div
            v-for="item in displayedRecords"
            :key="makeWordSelectionKey(item)"
            class="trow" :style="{ gridTemplateColumns: `34px 1fr ${shownColumns.map(() => 'auto').join(' ')} 122px` }"
          >
            <div
              :class="['check', { selected: isSelected(item) }]"
              role="checkbox"
              :aria-checked="isSelected(item)"
              :aria-label="`Select ${item.lemma || item.yield?.lemma || item.id}`"
              @click="toggleSelection(item)"
            >
              <span v-if="isSelected(item)">&#10003;</span>
            </div>
            <div class="lemma-cell">
              {{ item.lemma || item.yield?.lemma }}
            </div>
            <div
              v-for="col in shownColumns"
              :key="col"
              class="data-cell"
            >
              {{ formatColValue(item, col) }}
            </div>
            <div class="row-actions">
              <button class="action-btn" title="View" @click="handlePreview(item.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <button class="action-btn" title="Edit" @click="handleEdit(item.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button class="action-btn" title="More" @click="toggleMenu(item.id)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="5" cy="12" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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

.batch-summary-bar {
  min-height: 0;
}

/* Table wrapper — min-height:0 is critical for grid children to scroll */
.table-wrap {
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  background: var(--surface);
  padding: 12px;
}

.table-panel > .table-wrap {
  min-height: 0;
}

.table-shell {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--table-field);
}

/* Table header row */
.thead {
  display: grid;
  align-items: center;
  padding: 0 14px;
  min-height: 42px;
  background: #f4f1eb;
  color: #756d63;
  font-size: 12px;
  font-weight: 740;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--line);
}

[data-theme="dark"] .thead {
  background: var(--table-head);
  color: #aaa197;
}

.thead .right {
  justify-self: end;
  position: relative;
}

.thead-col {
  padding: 0 8px;
  white-space: nowrap;
}


/* Table row */
.trow {
  display: grid;
  align-items: center;
  padding: 0 14px;
  min-height: 51px;
  border-bottom: 1px solid var(--line);
  transition: background 0.12s ease;
}

.trow:last-child {
  border-bottom: 0;
}

.trow:hover {
  background: #f6f3ed;
}

[data-theme="dark"] .trow:hover {
  background: #2a251f;
}

/* Checkbox */
.check {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1px solid #b7aea3;
  background: #fff;
  color: #fff;
  font-size: 10px;
  line-height: 1;
  display: grid;
  place-items: center;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
}

[data-theme="dark"] .check {
  border-color: #575047;
  background: #201d18;
  color: #06100b;
}

.check.selected {
  background: var(--green);
  border-color: var(--green);
}

/* Lemma cell */
.lemma-cell {
  font-family: var(--serif);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.025em;
  color: #27231f;
  padding: 0 8px;
}

[data-theme="dark"] .lemma-cell {
  color: #eee8de;
}

.data-cell {
  padding: 0 8px;
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

/* Row actions — fade in on hover */
.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  opacity: 0.56;
  transition: opacity 0.12s ease;
}

.trow:hover .row-actions {
  opacity: 1;
}

.action-btn {
  width: 31px;
  height: 31px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: #fdfbf7;
  color: #5c564f;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.action-btn svg {
  width: 16px;
  height: 16px;
  stroke-width: 1.75;
}

.action-btn:hover {
  background: #faf8f5;
  border-color: var(--border-strong);
}

[data-theme="dark"] .action-btn {
  background: rgba(255, 255, 255, 0.045);
  color: #bdb3a7;
}

[data-theme="dark"] .action-btn:hover {
  background: rgba(255, 255, 255, 0.065);
  color: #fff;
}

/* Empty state */
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--muted);
  font-size: 13px;
}

/* Column menu — positioned relative to .right */
.column-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: 50;
  padding: 4px;
  min-width: 140px;
}

.column-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
}

.column-menu-item:hover {
  background: var(--surface-soft);
}

.column-menu-item input {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border-color: var(--border-strong);
  accent-color: var(--green);
}

/* ctl (reused in header column button) */
.ctl {
  height: 28px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  color: #625c54;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 1px 1px rgba(22, 16, 10, 0.018);
  cursor: pointer;
}

[data-theme="dark"] .ctl {
  background: rgba(255, 255, 255, 0.05);
  color: #c3b9ad;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.14);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
