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
import { useWordSync } from '@/composables/useWordSync';
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
  LocalSyncItem,
  SearchMode,
  SortMode,
  WordRecord,
} from '@/types/word-list';

interface WordStoreLike {
  connectionStatus: string;
  dbRecords: WordRecord[];
  localRecords: WordRecord[];
  dbListMeta: DbListMeta;
  loading: boolean;
  fetchLocalRecords: () => Promise<void>;
  fetchDbRecords: (params?: Partial<DbListMeta>) => Promise<void>;
  deleteWord: (id: string, isLocal: boolean) => Promise<void>;
  syncCheck: (items: LocalSyncItem[]) => Promise<any[]>;
  syncExecute: (
    items: LocalSyncItem[],
    forceUpdate: boolean
  ) => Promise<{ success?: number; failed?: number }>;
  checkConnection: () => Promise<void>;
  setEditorYaml: (yaml: string) => void;
  setEditingContext: (context: { id: string | null; isLocal: boolean }) => void;
}

interface AppStoreLike {
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface WordListApiResponse {
  items?: WordRecord[];
  page?: number;
  totalPages?: number;
}

const wordStore = useWordStore() as unknown as WordStoreLike;
const appStore = useAppStore() as unknown as AppStoreLike;
const { connectionStatus, dbRecords, localRecords, dbListMeta, loading } = storeToRefs(
  wordStore as any
) as {
  connectionStatus: Ref<string>;
  dbRecords: Ref<WordRecord[]>;
  localRecords: Ref<WordRecord[]>;
  dbListMeta: Ref<DbListMeta>;
  loading: Ref<boolean>;
};

// 计算属性：后端是否连通
const isBackendConnected = computed(() => connectionStatus.value === 'connected');

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
  return isBackendConnected.value ? dbListMeta.value.total || 0 : localRecords.value.length;
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
  const mappedLocal = (localRecords.value || []).map(r => ({
    ...r,
    isLocal: true,
    lemma: r.lemma || r.lemma_preview,
    original_yaml: r.original_yaml || r.raw_yaml,
  }));

  const merged = [...mappedLocal, ...(dbRecords.value || [])];
  return filterRecordsBySearch(merged, search.value, searchMode.value);
});

const selectedKeys = ref<Set<string>>(new Set());
const selectedItemsByKey = ref<Map<string, WordRecord>>(new Map());
const selectingAllMatching = ref(false);
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
const pendingDelete = ref<{ id: string; isLocal: boolean } | null>(null);

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

const openDelete = (id: string, isLocal: boolean): void => {
  pendingDelete.value = { id, isLocal };
  showMenuId.value = null;
};

const cancelDelete = (): void => {
  pendingDelete.value = null;
};

const confirmDelete = async () => {
  if (!pendingDelete.value) return;
  await wordStore.deleteWord(pendingDelete.value.id, pendingDelete.value.isLocal);
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
  deckName: ankiDeckName,
  modelName: ankiModelName,
  addReverse: ankiAddReverse,
  tagsInput: ankiTagsInput,
  apkgPath: ankiApkgPath,
  open: openAnkiExport,
  close: closeAnkiExport,
  connectAnki: connectAnkiExport,
  browseApkgPath: browseAnkiApkgPath,
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

const setAnkiAddReverse = (value: boolean): void => {
  ankiAddReverse.value = value;
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
  deckName: batchAnkiDeckName,
  modelName: batchAnkiModelName,
  addReverse: batchAnkiAddReverse,
  tagsInput: batchAnkiTagsInput,
  open: openBatchAnkiExportModal,
  close: closeBatchAnkiExportModal,
  reopenPanel: reopenBatchAnkiPanel,
  dismissSummary: dismissBatchAnkiSummary,
  connectAnki: connectBatchAnki,
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

const setBatchAddReverse = (value: boolean): void => {
  batchAnkiAddReverse.value = value;
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
  const response = await request.get<WordListApiResponse>('/words', {
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
    const currentSearch = isBackendConnected.value ? dbListMeta.value.search || '' : search.value;
    const localMatched = filterRecordsBySearch(
      localRecords.value || [],
      currentSearch,
      searchMode.value
    );
    const dbTotal = isBackendConnected.value ? dbListMeta.value.total || 0 : 0;
    const decision = buildSelectAllMatchingDecision(dbTotal, localMatched.length);

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
      isBackendConnected.value && dbTotal > 0
        ? await collectAllDbMatchingRecords(fetchDbPageForSelection, 200)
        : [];
    const mergedMap = mergeRecordsIntoSelectionMap(selectedItemsByKey.value, [
      ...localMatched,
      ...dbMatched,
    ]);
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

const localSyncItems = computed<LocalSyncItem[]>(() => {
  return (localRecords.value || []).map(r => ({
    id: String(r.id),
    raw_yaml: String(r.raw_yaml || ''),
  }));
});

const refresh = async () => {
  clearSelection();
  await Promise.all([wordStore.fetchLocalRecords(), wordStore.fetchDbRecords()]);
};

const { formatYamlForEditor, loadDbRecordByLemma, loadIntoEditor } = useWordEditorLoader({
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
} = useWordSync({
  wordStore,
  appStore,
  isBackendConnected,
  localSyncItems,
  refresh,
  closeMenu: () => {
    showMenuId.value = null;
  },
  formatYamlForEditor,
  loadDbRecordByLemma,
});

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
    class="bg-white rounded-xl shadow-sm border border-slate-200 flex-col flex h-full overflow-hidden ml-1"
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
      :deck-name="ankiDeckName"
      :model-name="ankiModelName"
      :add-reverse="ankiAddReverse"
      :tags-input="ankiTagsInput"
      :apkg-path="ankiApkgPath"
      @close="closeAnkiExport"
      @connect-anki="handleConnectAnkiExport"
      @browse-apkg-path="browseAnkiApkgPath"
      @update:deck-name="setAnkiDeckName"
      @update:model-name="setAnkiModelName"
      @update:add-reverse="setAnkiAddReverse"
      @update:tags-input="setAnkiTagsInput"
      @update:apkg-path="setAnkiApkgPath"
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
      :deck-name="batchAnkiDeckName"
      :model-name="batchAnkiModelName"
      :add-reverse="batchAnkiAddReverse"
      :tags-input="batchAnkiTagsInput"
      :can-edit-config="batchAnkiCanEditConfig"
      :can-cancel="batchAnkiCanCancel"
      :can-resume="batchAnkiCanResume"
      :last-stopped-phase="batchAnkiLastStoppedPhase"
      @close="closeBatchAnkiExportModal"
      @return="closeBatchAnkiExportModal"
      @connect-anki="connectBatchAnki(true)"
      @update:deck-name="setBatchDeckName"
      @update:model-name="setBatchModelName"
      @update:add-reverse="setBatchAddReverse"
      @update:tags-input="setBatchTagsInput"
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
      :is-backend-connected="isBackendConnected"
      :local-sync-count="localSyncItems.length"
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
    <div v-if="showBatchSummaryBar" class="px-4 py-2 border-b border-slate-100 bg-blue-50/50">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-xs font-semibold text-blue-700 whitespace-nowrap">
            {{ batchAnkiStageLabel }}
          </span>
          <span class="text-xs text-slate-600 whitespace-nowrap">
            {{ batchAnkiProgress.processed }}/{{ batchAnkiProgress.total }}
          </span>
          <div class="w-44 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              class="h-full bg-blue-500 transition-all duration-300"
              :style="{ width: `${batchAnkiProgress.percent}%` }"
            />
          </div>
          <span class="text-xs text-slate-500">
            imported {{ batchAnkiStatusSummary.imported + batchAnkiStatusSummary.overwritten }},
            duplicate {{ batchAnkiStatusSummary.duplicate }}, failed
            {{ batchAnkiStatusSummary.failed }}, cancelled {{ batchAnkiStatusSummary.cancelled }}
          </span>
          <span
            v-if="batchAnkiCanResume && batchAnkiLastStoppedPhase"
            class="text-xs text-amber-700 whitespace-nowrap"
          >
            Cancelled during {{ batchAnkiLastStoppedPhase }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            @click="openBatchPanelFromSummary"
          >
            Open Batch Panel
          </button>
          <button
            v-if="batchAnkiCanCancel"
            class="text-xs px-2 py-1 rounded border border-red-200 bg-white text-red-700 hover:bg-red-50"
            @click="cancelBatchFromSummary"
          >
            Cancel
          </button>
          <button
            v-if="batchAnkiCanResume"
            class="text-xs px-2 py-1 rounded border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
            @click="void resumeBatchFromSummary()"
          >
            Resume
          </button>
          <button
            class="text-xs px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="batchAnkiBusy || batchAnkiProgress.phase !== 'idle'"
            @click="closeBatchSummary"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto bg-slate-50">
      <div
        v-if="loading && !displayedRecords.length"
        class="text-center text-slate-400 py-10 flex flex-col items-center gap-2"
      >
        <i class="fa-solid fa-spinner fa-spin text-2xl" />
        <span>Loading records...</span>
      </div>

      <div
        v-else
        class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-visible m-4"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-left w-10"
                >
                  <input
                    type="checkbox"
                    :checked="isAllVisibleSelected"
                    class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    aria-label="Select all visible words"
                    @change="toggleSelectAllVisible"
                  />
                </th>
                <th
                  scope="col"
                  class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-left w-24"
                >
                  Src
                </th>
                <th
                  scope="col"
                  class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-left min-w-[220px]"
                >
                  Lemma
                </th>
                <th
                  scope="col"
                  class="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-right w-[160px]"
                />
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="item in displayedRecords"
                :key="makeWordSelectionKey(item)"
                :class="isSelected(item) ? 'bg-blue-50/60' : 'hover:bg-slate-50/60'"
              >
                <td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                  <input
                    type="checkbox"
                    :checked="isSelected(item)"
                    class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    :aria-label="`Select ${item.lemma || item.yield?.lemma || item.id}`"
                    @change="toggleSelection(item)"
                  />
                </td>
                <td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                  <span
                    v-if="item.isLocal"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold"
                    ><i class="fa-solid fa-laptop" />Local</span
                  >
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold"
                    ><i class="fa-solid fa-cloud" />DB</span
                  >
                </td>
                <td class="px-4 py-3 text-sm text-slate-700 font-bold text-slate-900">
                  {{ item.lemma || item.yield?.lemma }}
                </td>
                <td class="px-4 py-3 text-sm text-slate-700 text-right">
                  <div class="flex items-center justify-end gap-2 w-[140px]">
                    <button
                      class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                      @click="handlePreview(item.id)"
                    >
                      <i class="fa-solid fa-eye" />
                    </button>
                    <button
                      class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                      @click="handleEdit(item.id)"
                    >
                      <i class="fa-solid fa-pen" />
                    </button>
                    <button
                      class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                      @click="toggleMenu(item.id)"
                    >
                      <i class="fa-solid fa-ellipsis" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
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
