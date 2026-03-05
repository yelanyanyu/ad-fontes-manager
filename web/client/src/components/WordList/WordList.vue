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

import {ref, computed, onMounted, watch, onActivated} from 'vue';
import {useWordStore} from '@/stores/wordStore';
import {storeToRefs} from 'pinia';
import {useAppStore} from '@/stores/appStore';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import WordActionMenu from '@/components/WordList/WordActionMenu.vue';
import DeleteConfirmModal from '@/components/WordList/DeleteConfirmModal.vue';
import BatchSyncModal from '@/components/WordList/BatchSyncModal.vue';
import WordListToolbar from '@/components/WordList/WordListToolbar.vue';
import WordListPagination from '@/components/WordList/WordListPagination.vue';
import {deepDiffAdapter, yamlFormatter} from '@/utils/conflict';
import {normalizeSearchInput, isBlankSearch, filterRecordsBySearch} from '@/utils/search';
import {useWordEditorLoader} from '@/composables/useWordEditorLoader';
import {useWordSync} from '@/composables/useWordSync';

const wordStore = useWordStore();
const appStore = useAppStore();
const {connectionStatus, dbRecords, localRecords, dbListMeta, loading} = storeToRefs(wordStore);

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

const getDiffBadges = diffs => deepDiffAdapter.getBadges(diffs);
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
  pendingDelete.value = {id, isLocal};
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

const localSyncItems = computed(() => {
  return (localRecords.value || []).map(r => ({id: r.id, raw_yaml: r.raw_yaml}));
});

const refresh = async () => {
  await Promise.all([wordStore.fetchLocalRecords(), wordStore.fetchDbRecords()]);
};

const {formatYamlForEditor, loadDbRecordByLemma, loadIntoEditor} = useWordEditorLoader({
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
  await wordStore.fetchDbRecords({search: searchValue, page: 1});
};

const handleSearchKeydown = e => {
  if (e.keyCode === 13) {
    e.preventDefault();
    handleSearch();
  }
};

const updateSearch = value => {
  search.value = value;
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

const updateSort = value => {
  sort.value = value;
  handleSort();
};

const updatePageSize = value => {
  const next = Number(value);
  pageSize.value = Number.isFinite(next) ? next : pageSize.value;
  handlePageSize();
};

const handleSort = () => {
  wordStore.fetchDbRecords({sort: sort.value, page: 1});
};

const handlePageSize = () => {
  wordStore.fetchDbRecords({limit: pageSize.value, page: 1});
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
    wordStore.fetchDbRecords({page: newPage});
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
    wordStore.fetchDbRecords({page});
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

</script>

<template>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 flex-col flex h-full overflow-hidden ml-1">
    <WordActionMenu
        :open="showMenuId !== null"
        :item="selectedMenuItem"
        @close="showMenuId = null"
        @sync="syncOne"
        @export="handleExport"
        @delete="openDelete"
    />
    <DeleteConfirmModal
        :open="!!pendingDelete"
        @cancel="cancelDelete"
        @confirm="confirmDelete"
    />
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
    />

    <div class="flex-1 overflow-y-auto bg-slate-50">
      <div
          v-if="loading && !displayedRecords.length"
          class="text-center text-slate-400 py-10 flex flex-col items-center gap-2"
      >
        <i class="fa-solid fa-spinner fa-spin text-2xl"/>
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
                  ><i class="fa-solid fa-laptop"/>Local</span>
                <span
                    v-else
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold"
                ><i class="fa-solid fa-cloud"/>DB</span>
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
                    <i class="fa-solid fa-eye"/>
                  </button>
                  <button
                      class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                      @click="handleEdit(item.id)"
                  >
                    <i class="fa-solid fa-pen"/>
                  </button>
                  <button
                      class="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                      @click="toggleMenu(item.id)"
                  >
                    <i class="fa-solid fa-ellipsis"/>
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
