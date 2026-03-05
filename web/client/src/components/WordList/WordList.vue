<script setup>
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
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import request from '@/utils/request';
import yaml from 'js-yaml';
import { useAppStore } from '@/stores/appStore';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import { normalizeSearchInput, isBlankSearch, filterRecordsBySearch } from '@/utils/search';

const wordStore = useWordStore();
const appStore = useAppStore();
const { connectionStatus, dbRecords, localRecords, dbListMeta, loading } = storeToRefs(wordStore);

// 计算属性：后端是否连通
const isBackendConnected = computed(() => connectionStatus.value === 'connected');

/**
 * @description 搜索关键词
 * @type {Ref<string>}
 * @default ''
 * @remarks 用户输入的搜索关键词，用于过滤词条列表
 */
const search = ref('');

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
const sort = ref('newest');

/**
 * @description 每页显示数量
 * @type {Ref<number>}
 * @default 20
 * @remarks 控制每页显示的词条数量，范围 1-500
 */
const pageSize = ref(20);

const searchMode = ref('partial');
const searchModeOpen = ref(false);
const searchModeStorageKey = 'word_search_mode';

// Sync meta from store to local refs if needed, or just use store actions
watch(dbListMeta, meta => {
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
const displayedRecords = computed(() => {
  const mappedLocal = (localRecords.value || []).map(r => ({
    ...r,
    isLocal: true,
    lemma: r.lemma || r.lemma_preview,
    original_yaml: r.original_yaml || r.raw_yaml,
  }));

  const merged = [...mappedLocal, ...(dbRecords.value || [])];
  return filterRecordsBySearch(merged, search.value, searchMode.value);
});

const emit = defineEmits(['preview', 'edit']);

const handlePreview = id => {
  emit('preview', id);
};

const handleEdit = id => {
  loadIntoEditor(id);
};

const showMenuId = ref(null);
const pendingDelete = ref(null);
const syncAllOpen = ref(false);
const syncAllLoading = ref(false);
const syncChecks = ref([]);
const syncActions = ref({});
const syncConflict = ref(null);

const getDiffBadges = diffs => deepDiffAdapter.getBadges(diffs);
const getChangedModules = diffs => deepDiffAdapter.getModules(diffs);
const syncConflictTitle = computed(() =>
  syncConflict.value ? `Conflict: ${syncConflict.value.lemma || ''}` : 'Conflict'
);
const searchModeLabel = computed(() =>
  searchMode.value === 'exact' ? 'Exact Match' : 'Partial Match'
);

const toggleMenu = id => {
  if (showMenuId.value === id) {
    showMenuId.value = null;
  } else {
    showMenuId.value = id;
  }
};

const selectedMenuItem = computed(() => {
  if (!showMenuId.value) return null;
  return displayedRecords.value.find(r => r.id === showMenuId.value) || null;
});

const openDelete = (id, isLocal) => {
  pendingDelete.value = { id, isLocal };
  showMenuId.value = null;
};

const cancelDelete = () => {
  pendingDelete.value = null;
};

const confirmDelete = async () => {
  if (!pendingDelete.value) return;
  await wordStore.deleteWord(pendingDelete.value.id, pendingDelete.value.isLocal);
  pendingDelete.value = null;
};

const handleExport = () => {
  appStore.addToast('Export feature is not implemented yet.', 'info');
  showMenuId.value = null;
};

const formatYamlForEditor = yamlObj => {
  const orderedObj = {};
  const keyOrder = ['yield', 'etymology', 'cognate_family', 'application', 'nuance'];
  for (const k of keyOrder) {
    if (yamlObj && yamlObj[k] !== undefined) orderedObj[k] = yamlObj[k];
  }
  if (yamlObj && typeof yamlObj === 'object') {
    for (const k of Object.keys(yamlObj)) {
      if (!keyOrder.includes(k)) orderedObj[k] = yamlObj[k];
    }
  }
  return yaml.dump(orderedObj, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    sortKeys: false,
  });
};

const localSyncItems = computed(() => {
  return (localRecords.value || []).map(r => ({ id: r.id, raw_yaml: r.raw_yaml }));
});

/**
 * @description 打开批量同步对话框
 * @async
 * @function openSyncAll
 * @returns {Promise<void>}
 * @remarks 执行批量同步前的检查和准备：
 * 1. 检查后端连接状态
 * 2. 执行同步预检查（syncCheck）
 * 3. 如果没有冲突，直接执行同步
 * 4. 如果有冲突，显示冲突解决对话框
 * @throws 当同步检查失败时显示错误提示
 */
const openSyncAll = async () => {
  if (!isBackendConnected.value) {
    appStore.addToast('Backend disconnected', 'warning');
    return;
  }
  if (!localSyncItems.value.length) return;

  syncAllLoading.value = true;
  try {
    const checks = await wordStore.syncCheck(localSyncItems.value);
    syncChecks.value = checks || [];

    const nextActions = {};
    for (const c of syncChecks.value) {
      if (c.status === 'conflict') nextActions[c.id] = 'skip';
    }
    syncActions.value = nextActions;

    const hasConflict = syncChecks.value.some(c => c.status === 'conflict');
    if (!hasConflict) {
      await runBatchSyncDirect();
      return;
    }
    syncAllOpen.value = true;
  } catch (e) {
    await wordStore.checkConnection();
    appStore.addToast('Sync check failed (database offline)', 'error');
  } finally {
    syncAllLoading.value = false;
  }
};

const closeSyncAll = () => {
  syncAllOpen.value = false;
  syncChecks.value = [];
  syncActions.value = {};
};

const setBatchAction = (id, action) => {
  syncActions.value = { ...syncActions.value, [id]: action };
};

const runBatchSyncDirect = async () => {
  const res = await wordStore.syncExecute(localSyncItems.value, false);
  if (res && (res.success > 0 || res.failed === 0)) {
    appStore.addToast(`Synced ${res.success} items`, 'success');
    await refresh();
  } else {
    appStore.addToast('Sync failed', 'error');
  }
};

const executeBatchSync = async () => {
  if (!syncChecks.value.length) {
    closeSyncAll();
    return;
  }

  const conflicts = syncChecks.value.filter(c => c.status === 'conflict');
  const nonConflicts = syncChecks.value.filter(c => c.status !== 'conflict');

  const normalItems = nonConflicts
    .map(c => localSyncItems.value.find(i => i.id === c.id))
    .filter(Boolean);

  const forcedItems = conflicts
    .filter(c => syncActions.value[c.id] === 'overwrite')
    .map(c => localSyncItems.value.find(i => i.id === c.id))
    .filter(Boolean);

  syncAllLoading.value = true;
  try {
    if (normalItems.length) await wordStore.syncExecute(normalItems, false);
    if (forcedItems.length) await wordStore.syncExecute(forcedItems, true);
    appStore.addToast('Batch sync completed', 'success');
    closeSyncAll();
    await refresh();
  } catch (e) {
    await wordStore.checkConnection();
    appStore.addToast('Batch sync failed (database offline)', 'error');
  } finally {
    syncAllLoading.value = false;
  }
};

/**
 * @description 同步单个词条
 * @async
 * @function syncOne
 * @param {string} id - 要同步的词条ID
 * @returns {Promise<void>}
 * @remarks 执行单个词条的同步操作：
 * 1. 检查后端连接状态
 * 2. 执行同步预检查
 * 3. 如果检测到冲突，显示冲突解决弹窗
 * 4. 如果没有冲突，直接执行同步
 * @throws 当同步失败时显示错误提示
 */
const syncOne = async id => {
  if (!isBackendConnected.value) {
    appStore.addToast('Backend disconnected', 'warning');
    return;
  }
  const item = localSyncItems.value.find(i => i.id === id);
  if (!item) return;

  syncAllLoading.value = true;
  try {
    const checks = await wordStore.syncCheck([item]);
    const check = Array.isArray(checks) ? checks[0] : null;
    if (!check) return;
    if (check.status === 'conflict') {
      syncConflict.value = check;
      return;
    }
    const res = await wordStore.syncExecute([item], false);
    if (res && res.success > 0) {
      appStore.addToast('Synced 1 item', 'success');
      await refresh();
    } else {
      appStore.addToast('Sync failed', 'error');
    }
  } catch (e) {
    await wordStore.checkConnection();
    appStore.addToast('Sync failed (database offline)', 'error');
  } finally {
    syncAllLoading.value = false;
    showMenuId.value = null;
  }
};

const closeSyncConflict = () => {
  syncConflict.value = null;
};

const editLocalFromSyncConflict = () => {
  if (!syncConflict.value) return;
  if (syncConflict.value.newData) {
    wordStore.setEditorYaml(formatYamlForEditor(syncConflict.value.newData));
    wordStore.setEditingContext({ id: syncConflict.value.id, isLocal: true });
  }
  closeSyncConflict();
};

const loadDbRecordByLemma = async lemma => {
  if (!lemma) return false;
  try {
    const res = await request.get('/words', {
      params: { search: String(lemma), page: 1, limit: 20, sort: 'newest' },
      skipErrorToast: true,
    });
    const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
    const target = String(lemma).toLowerCase();
    const match = items.find(i => String(i.lemma || '').toLowerCase() === target);
    if (match && match.id) {
      const full = await request.get(`/words/${encodeURIComponent(match.id)}`, {
        skipErrorToast: true,
      });
      if (full && full.original_yaml) {
        const obj =
          typeof full.original_yaml === 'string'
            ? yaml.load(full.original_yaml)
            : full.original_yaml;
        wordStore.setEditorYaml(formatYamlForEditor(obj));
        wordStore.setEditingContext({ id: match.id, isLocal: false });
        return true;
      }
    }
  } catch (e) {}
  return false;
};

const overwriteSyncConflict = async () => {
  if (!syncConflict.value) return;
  const conflict = syncConflict.value;
  const item = localSyncItems.value.find(i => i.id === conflict.id);
  if (!item) return;
  syncAllLoading.value = true;
  try {
    const res = await wordStore.syncExecute([item], true);
    if (res && res.success > 0) {
      appStore.addToast('Synced (overwrite)', 'success');
      await refresh();
      const lemma = conflict.newData?.yield?.lemma;
      const loaded = await loadDbRecordByLemma(lemma);
      if (!loaded && conflict.newData) {
        wordStore.setEditorYaml(formatYamlForEditor(conflict.newData));
        wordStore.setEditingContext({ id: null, isLocal: false });
      }
    } else {
      appStore.addToast('Sync failed', 'error');
    }
    closeSyncConflict();
  } catch (e) {
    await wordStore.checkConnection();
    appStore.addToast('Sync failed (database offline)', 'error');
  } finally {
    syncAllLoading.value = false;
  }
};

/**
 * 将指定词条加载到编辑器中
 *
 * @description
 * 根据词条 ID 查找并加载词条数据到 YAML 编辑器。
 * 支持本地词条和数据库词条两种来源，会自动处理 YAML 解析和格式化。
 *
 * **调用关系：**
 * - **被调用：**
 *   - `handleEdit()` - 用户点击编辑按钮时调用
 *   - `overwriteSyncConflict()` - 同步冲突解决后加载数据库版本
 * - **调用：**
 *   - `wordStore.setEditorYaml()` - 设置编辑器内容
 *   - `wordStore.setEditingContext()` - 设置编辑上下文（ID 和来源）
 *   - `request.get()` - 从数据库获取完整词条数据
 *   - `yaml.load()` - 解析 YAML 字符串
 *   - `formatYamlForEditor()` - 格式化 YAML 用于编辑器显示
 *
 * **处理逻辑：**
 * 1. 如果是本地词条（item.isLocal = true）：
 *    - 直接从本地记录中解析 YAML
 *    - 设置编辑上下文为本地模式
 * 2. 如果是数据库词条：
 *    - 优先尝试从列表缓存中获取 YAML
 *    - 如果缓存不完整，发起 API 请求获取完整数据
 *    - 设置编辑上下文为数据库模式
 *
 * @async
 * @function loadIntoEditor
 * @param {string} id - 要加载的词条 ID
 * @returns {Promise<void>}
 *
 * @example
 * // 用户点击编辑按钮
 * handleEdit('word-123'); // 内部调用 loadIntoEditor('word-123')
 *
 * // 同步冲突解决后加载数据库版本
 * await loadIntoEditor(conflict.id);
 */
const loadIntoEditor = async id => {
  const item = displayedRecords.value.find(r => r.id === id);
  if (!item) {
    console.warn(`[loadIntoEditor] 未找到 ID 为 ${id} 的词条`);
    return;
  }

  console.log(`[loadIntoEditor] 开始加载词条: ${id}, 来源: ${item.isLocal ? '本地' : '数据库'}`);

  // 处理本地词条
  if (item.isLocal) {
    try {
      const rawYaml = String(item.raw_yaml || item.original_yaml || '');
      const obj = yaml.load(rawYaml);
      wordStore.setEditorYaml(formatYamlForEditor(obj));
      console.log(`[loadIntoEditor] 本地词条 YAML 解析成功: ${id}`);
    } catch (e) {
      console.warn(`[loadIntoEditor] 本地词条 YAML 解析失败，使用原始文本: ${id}`, e);
      wordStore.setEditorYaml(String(item.raw_yaml || item.original_yaml || ''));
    }
    wordStore.setEditingContext({ id, isLocal: true });
    console.log(`[loadIntoEditor] 本地词条已加载到编辑器: ${id}`);
    return;
  }

  // 处理数据库词条 - 尝试从列表缓存获取
  try {
    const full = await request.get(`/words/${encodeURIComponent(id)}`, { skipErrorToast: true });
    if (full && full.original_yaml) {
      const obj =
        typeof full.original_yaml === 'string' ? yaml.load(full.original_yaml) : full.original_yaml;
      wordStore.setEditorYaml(formatYamlForEditor(obj));
      wordStore.setEditingContext({ id, isLocal: false });
      console.log(`[loadIntoEditor] 数据库词条已加载（从 API）: ${id}`);
      return;
    }
  } catch (e) {
    console.warn(`[loadIntoEditor] 从 API 获取词条失败: ${id}`, e);
  }

  // 尝试使用列表中的缓存数据
  if (item.original_yaml) {
    try {
      const obj =
        typeof item.original_yaml === 'string' ? yaml.load(item.original_yaml) : item.original_yaml;
      wordStore.setEditorYaml(formatYamlForEditor(obj));
      console.log(`[loadIntoEditor] 数据库词条已加载（从缓存）: ${id}`);
    } catch (e) {
      console.warn(`[loadIntoEditor] 缓存 YAML 解析失败: ${id}`, e);
      const txt =
        typeof item.original_yaml === 'string'
          ? item.original_yaml
          : yaml.dump(item.original_yaml, { lineWidth: -1, noRefs: true });
      wordStore.setEditorYaml(txt);
    }
    wordStore.setEditingContext({ id, isLocal: false });
    return;
  }

  // 最后尝试：再次从 API 获取（带完整错误处理）
  try {
    const full = await request.get(`/words/${encodeURIComponent(id)}`, { skipErrorToast: true });
    if (full && full.original_yaml) {
      try {
        const obj =
          typeof full.original_yaml === 'string'
            ? yaml.load(full.original_yaml)
            : full.original_yaml;
        wordStore.setEditorYaml(formatYamlForEditor(obj));
        console.log(`[loadIntoEditor] 数据库词条已加载（二次 API 请求）: ${id}`);
      } catch (e) {
        console.warn(`[loadIntoEditor] YAML 解析失败，使用原始文本: ${id}`, e);
        const txt =
          typeof full.original_yaml === 'string'
            ? full.original_yaml
            : yaml.dump(full.original_yaml, { lineWidth: -1, noRefs: true });
        wordStore.setEditorYaml(txt);
      }
      wordStore.setEditingContext({ id, isLocal: false });
    } else {
      console.error(`[loadIntoEditor] 词条数据为空: ${id}`);
    }
  } catch (e) {
    console.error(`[loadIntoEditor] 加载词条失败: ${id}`, e);
  }
};

onMounted(() => {
  const storedMode = localStorage.getItem(searchModeStorageKey);
  if (storedMode === 'exact' || storedMode === 'partial') {
    searchMode.value = storedMode;
  }
  refresh();
});

onActivated(() => {
  refresh();
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
  await wordStore.fetchDbRecords({ search: searchValue, page: 1 });
};

const handleSearchKeydown = e => {
  if (e.keyCode === 13) {
    e.preventDefault();
    handleSearch();
  }
};

const toggleSearchMode = () => {
  searchModeOpen.value = !searchModeOpen.value;
};

const closeSearchMode = () => {
  searchModeOpen.value = false;
};

const setSearchMode = mode => {
  searchMode.value = mode;
  searchModeOpen.value = false;
};

const handleSort = () => {
  wordStore.fetchDbRecords({ sort: sort.value, page: 1 });
};

const handlePageSize = () => {
  wordStore.fetchDbRecords({ limit: pageSize.value, page: 1 });
};

/**
 * @description 翻页
 * @function changePage
 * @param {number} delta - 页码变化量（正数为下一页，负数为上一页）
 * @remarks 根据变化量切换页面：
 * - 检查新页码是否在有效范围内（1 到 totalPages）
 * - 调用 fetchDbRecords 获取新页面的数据
 */
const changePage = delta => {
  const newPage = dbListMeta.value.page + delta;
  if (newPage >= 1 && newPage <= dbListMeta.value.totalPages) {
    wordStore.fetchDbRecords({ page: newPage });
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
const goToPage = page => {
  if (page >= 1 && page <= dbListMeta.value.totalPages) {
    wordStore.fetchDbRecords({ page });
  }
};

const paginationRange = computed(() => {
  const current = dbListMeta.value.page;
  const total = dbListMeta.value.totalPages;
  const delta = 2;
  const range = [];

  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i);
  }

  if (current - delta > 2) range.unshift('...');
  if (current + delta < total - 1) range.push('...');

  range.unshift(1);
  if (total > 1) range.push(total);

  return range;
});

const refresh = async () => {
  await Promise.all([wordStore.fetchLocalRecords(), wordStore.fetchDbRecords()]);
};
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 flex-col flex h-full overflow-hidden ml-1">
    <div
      v-if="searchModeOpen"
      class="fixed inset-0 z-30"
      @click="closeSearchMode"
    />
    <div
      v-if="showMenuId !== null"
      class="fixed inset-0 z-30 bg-black/30"
      @click="showMenuId = null"
    />
    <div
      v-if="showMenuId !== null"
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
    >
      <div class="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between">
          <span>More</span>
          <button
            class="text-slate-400 hover:text-slate-600 transition-colors"
            @click="showMenuId = null"
          >
            <i class="fa-solid fa-xmark text-xl" />
          </button>
        </div>
        <div class="p-2">
          <button
            v-if="selectedMenuItem?.isLocal"
            class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2"
            @click="syncOne(selectedMenuItem.id)"
          >
            <i class="fa-solid fa-cloud-arrow-up w-5 text-center" />
            <span>Sync</span>
          </button>
          <button
            class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2"
            @click="handleExport"
          >
            <i class="fa-solid fa-download w-5 text-center" />
            <span>Export</span>
          </button>
          <button
            class="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-2"
            @click="openDelete(selectedMenuItem.id, selectedMenuItem.isLocal)"
          >
            <i class="fa-solid fa-trash w-5 text-center" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="pendingDelete"
      class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
    >
      <div class="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800">
          Delete Word
        </div>
        <div class="px-4 py-4 text-sm text-slate-600">
          确认删除该词条？此操作不可撤销。
        </div>
        <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors"
            @click="cancelDelete"
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
            @click="confirmDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="syncAllOpen"
      class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
    >
      <div class="w-full max-w-3xl rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between">
          <span>Sync All</span>
          <button
            class="text-slate-400 hover:text-slate-600 transition-colors"
            @click="closeSyncAll"
          >
            <i class="fa-solid fa-xmark text-xl" />
          </button>
        </div>
        <div class="px-4 py-3 text-sm text-slate-600 border-b border-slate-100">
          Found {{ syncChecks.filter(c => c.status === 'conflict').length }} conflicts among {{ syncChecks.length }} items
        </div>
        <div class="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          <div
            v-for="c in syncChecks"
            :key="c.id"
            class="p-3 rounded-lg border flex items-center justify-between gap-3"
            :class="c.status === 'conflict' ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'"
          >
            <div class="min-w-0">
              <div class="font-bold text-slate-800 truncate">
                {{ c.lemma || 'unknown' }}
              </div>
              <div class="text-xs text-slate-500">
                {{ c.status }}
              </div>
              <div
                v-if="c.status === 'conflict'"
                class="mt-2 flex flex-wrap gap-1"
              >
                <span
                  v-for="b in getDiffBadges(c.diff)"
                  :key="b.path"
                  class="px-2 py-0.5 rounded border text-[10px] font-bold"
                  :class="b.cls"
                >{{ b.path }}</span>
              </div>
            </div>
            <div
              v-if="c.status === 'conflict'"
              class="flex items-center gap-3 flex-none"
            >
              <label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  :name="`action_${c.id}`"
                  value="skip"
                  class="text-primary"
                  :checked="(syncActions[c.id] || 'skip') === 'skip'"
                  @change="setBatchAction(c.id, 'skip')"
                >
                <span>Skip</span>
              </label>
              <label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  :name="`action_${c.id}`"
                  value="overwrite"
                  class="text-red-500 focus:ring-red-500"
                  :checked="syncActions[c.id] === 'overwrite'"
                  @change="setBatchAction(c.id, 'overwrite')"
                >
                <span>Overwrite</span>
              </label>
            </div>
            <div
              v-else
              class="text-xs text-green-700 font-bold flex-none"
            >
              Will Sync
            </div>
          </div>
        </div>
        <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors"
            @click="closeSyncAll"
          >
            Cancel
          </button>
          <button
            :disabled="syncAllLoading"
            class="px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
            @click="executeBatchSync"
          >
            Sync
          </button>
        </div>
      </div>
    </div>
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
    <div class="px-4 py-3 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50 flex-none">
      <div class="flex items-center gap-2 w-full">
        <div class="relative w-full">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-xs" />
          <input
            v-model="search"
            type="text"
            placeholder="Search..."
            class="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-4 text-xs focus:ring-1 focus:ring-primary transition-all outline-none placeholder-slate-400" 
            @keydown="handleSearchKeydown"
          >
        </div>
        <div class="relative flex items-stretch">
          <button
            :disabled="!canSearch"
            class="min-w-[88px] text-xs bg-primary text-white rounded-l-lg px-3 py-1.5 hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            @click="handleSearch"
          >
            <i
              v-if="loading"
              class="fa-solid fa-spinner fa-spin text-xs"
            />
            <span>{{ loading ? 'Searching' : 'Search' }}</span>
          </button>
          <button
            class="w-10 bg-primary text-white rounded-r-lg border-l border-blue-400/50 hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
            :title="searchModeLabel"
            @click="toggleSearchMode"
          >
            <i class="fa-solid fa-magnifying-glass text-[11px]" />
            <span class="text-[10px]">▼</span>
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1 scale-95"
            enter-to-class="opacity-100 translate-y-0 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 translate-y-0 scale-100"
            leave-to-class="opacity-0 -translate-y-1 scale-95"
          >
            <div
              v-if="searchModeOpen"
              class="absolute right-0 top-full mt-2 z-40 w-44 rounded-lg border border-slate-200 bg-white shadow-lg p-1"
            >
              <button
                class="w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors"
                :class="searchMode === 'partial' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'"
                @click="setSearchMode('partial')"
              >
                Partial Match
              </button>
              <button
                class="w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors"
                :class="searchMode === 'exact' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'"
                @click="setSearchMode('exact')"
              >
                Exact Match
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <select
            v-model="sort"
            class="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-600 outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer"
            @change="handleSort"
          >
            <option value="az">
              A-Z
            </option>
            <option value="za">
              Z-A
            </option>
            <option value="newest">
              Newest
            </option>
            <option value="oldest">
              Oldest
            </option>
          </select>
          <div class="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1 shadow-sm">
            <span class="text-[10px] text-slate-400 uppercase font-bold">Size</span>
            <input
              v-model="pageSize"
              type="number"
              min="1"
              max="500"
              class="w-10 text-xs bg-transparent outline-none text-center font-medium text-slate-700"
              @change="handlePageSize"
            >
          </div>
          <button
            v-if="isBackendConnected && localSyncItems.length"
            :disabled="syncAllLoading"
            class="text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-600 hover:bg-slate-50 shadow-sm flex items-center gap-2 disabled:opacity-60"
            @click="openSyncAll"
          >
            <i class="fa-solid fa-cloud-arrow-up" />
            <span>Sync All ({{ localSyncItems.length }})</span>
          </button>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">{{ totalCount }} words</span>
          <button
            class="text-slate-400 hover:text-primary transition-colors p-1"
            title="Reload All"
            @click="refresh"
          >
            <i
              class="fa-solid fa-arrows-rotate"
              :class="{ 'fa-spin': loading }"
            />
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
        <div
        class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-visible m-4"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-slate-50">
              <tr>
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
                :key="item.id"
                class="hover:bg-slate-50/60"
              >
                <td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                  <span
                    v-if="item.isLocal"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold"
                  ><i class="fa-solid fa-laptop" />Local</span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold"
                  ><i class="fa-solid fa-cloud" />DB</span>
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
    <div
      <div
      class="p-3 border-t border-slate-100 bg-white flex justify-between items-center text-xs text-slate-500 flex-none"
    >
      <span class="font-medium">Page {{ dbListMeta.page }} of {{ dbListMeta.totalPages }}</span>
      <div class="flex items-center gap-2">
        <button
          :disabled="dbListMeta.page <= 1"
          class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          @click="changePage(-1)"
        >
          Prev
        </button>
        <div class="flex items-center gap-1">
          <button
            v-for="(p, index) in paginationRange"
            :key="index"
            :class="[
              'px-2.5 py-1 text-xs rounded transition-colors',
              p === dbListMeta.page 
                ? 'bg-primary text-white font-bold' 
                : typeof p === 'number' 
                  ? 'hover:bg-slate-100 text-slate-600' 
                  : 'text-slate-400 cursor-default'
            ]"
            :disabled="typeof p !== 'number'"
            @click="typeof p === 'number' ? goToPage(p) : null"
          >
            {{ p }}
          </button>
        </div>
        <button
          :disabled="dbListMeta.page >= dbListMeta.totalPages"
          class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          @click="changePage(1)"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
