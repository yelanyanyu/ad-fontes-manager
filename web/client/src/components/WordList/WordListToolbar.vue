<script setup lang="ts">
import type { SearchMode, SortMode } from '@/types/word-list';

defineProps<{
  search: string;
  loading: boolean;
  canSearch: boolean;
  searchMode: SearchMode;
  searchModeOpen: boolean;
  searchModeLabel: string;
  sort: SortMode;
  pageSize: number;
  isBackendConnected: boolean;
  localSyncCount: number;
  totalCount: number;
  syncAllLoading: boolean;
}>();

const emit = defineEmits<{
  (e: 'update-search', value: string): void;
  (e: 'search'): void;
  (e: 'search-keydown', event: KeyboardEvent): void;
  (e: 'toggle-search-mode'): void;
  (e: 'close-search-mode'): void;
  (e: 'set-search-mode', mode: SearchMode): void;
  (e: 'sort-change', value: string): void;
  (e: 'page-size-change', value: string): void;
  (e: 'open-sync-all'): void;
  (e: 'refresh'): void;
}>();

const onSearchInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  emit('update-search', target?.value ?? '');
};

const onSortChange = (event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  emit('sort-change', target?.value ?? 'newest');
};

const onPageSizeChange = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  emit('page-size-change', target?.value ?? '');
};
</script>

<template>
  <div v-if="searchModeOpen" class="fixed inset-0 z-30" @click="emit('close-search-mode')" />

  <div class="px-4 py-3 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50 flex-none">
    <div class="flex items-center gap-2 w-full">
      <div class="relative w-full">
        <i
          class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-xs"
        />
        <input
          :value="search"
          type="text"
          placeholder="Search..."
          class="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-8 pr-4 text-xs focus:ring-1 focus:ring-primary transition-all outline-none placeholder-slate-400"
          @input="onSearchInput"
          @keydown="emit('search-keydown', $event)"
        />
      </div>
      <div class="relative flex items-stretch">
        <button
          :disabled="!canSearch"
          class="min-w-[88px] text-xs bg-primary text-white rounded-l-lg px-3 py-1.5 hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          @click="emit('search')"
        >
          <i v-if="loading" class="fa-solid fa-spinner fa-spin text-xs" />
          <span>{{ loading ? 'Searching' : 'Search' }}</span>
        </button>
        <button
          class="w-10 bg-primary text-white rounded-r-lg border-l border-blue-400/50 hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
          :title="searchModeLabel"
          @click="emit('toggle-search-mode')"
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
              :class="
                searchMode === 'partial'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50'
              "
              @click="emit('set-search-mode', 'partial')"
            >
              Partial Match
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors"
              :class="
                searchMode === 'exact'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50'
              "
              @click="emit('set-search-mode', 'exact')"
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
          :value="sort"
          class="text-xs border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-600 outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer"
          @change="onSortChange"
        >
          <option value="az">A-Z</option>
          <option value="za">Z-A</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <div
          class="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1 shadow-sm"
        >
          <span class="text-[10px] text-slate-400 uppercase font-bold">Size</span>
          <input
            :value="pageSize"
            type="number"
            min="1"
            max="500"
            class="w-10 text-xs bg-transparent outline-none text-center font-medium text-slate-700"
            @change="onPageSizeChange"
          />
        </div>
        <button
          v-if="isBackendConnected && localSyncCount"
          :disabled="syncAllLoading"
          class="text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-600 hover:bg-slate-50 shadow-sm flex items-center gap-2 disabled:opacity-60"
          @click="emit('open-sync-all')"
        >
          <i class="fa-solid fa-cloud-arrow-up" />
          <span>Sync All ({{ localSyncCount }})</span>
        </button>
      </div>
      <div class="flex items-center gap-3">
        <span
          class="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"
        >
          {{ totalCount }} words
        </span>
        <button
          class="text-slate-400 hover:text-primary transition-colors p-1"
          title="Reload All"
          @click="emit('refresh')"
        >
          <i class="fa-solid fa-arrows-rotate" :class="{ 'fa-spin': loading }" />
        </button>
      </div>
    </div>
  </div>
</template>
