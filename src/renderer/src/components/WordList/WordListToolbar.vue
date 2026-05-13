<script setup lang="ts">
import { ref } from 'vue';
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
  selectedCount: number;
  hasSelection: boolean;
  selectingAllMatching?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update-search', value: string): void;
  (e: 'search'): void;
  (e: 'clear-search'): void;
  (e: 'search-keydown', event: KeyboardEvent): void;
  (e: 'toggle-search-mode'): void;
  (e: 'close-search-mode'): void;
  (e: 'set-search-mode', mode: SearchMode): void;
  (e: 'sort-change', value: string): void;
  (e: 'page-size-change', value: string): void;
  (e: 'open-sync-all'): void;
  (e: 'refresh'): void;
  (e: 'print-selected'): void;
  (e: 'clear-selection'): void;
  (e: 'open-batch-anki-export'): void;
  (e: 'select-all-matching'): void;
}>();

const searchInput = ref<HTMLInputElement | null>(null);

const onSearchInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  emit('update-search', target?.value ?? '');
};

const clearSearch = () => {
  emit('clear-search');
  searchInput.value?.focus();
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
  <div v-if="searchModeOpen" class="search-backdrop" @click="emit('close-search-mode')" />

  <div class="toolbar">
    <div class="toolbar-row">
      <div class="search-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref="searchInput"
          :value="search"
          type="text"
          placeholder="Search..."
          @input="onSearchInput"
          @keydown="emit('search-keydown', $event)"
        />
        <button
          v-if="search"
          type="button"
          class="search-clear"
          title="Clear search"
          aria-label="Clear search"
          @mousedown.prevent
          @click="clearSearch"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div class="search-actions">
        <button
          :disabled="!canSearch"
          class="search-btn"
          @click="emit('search')"
        >
          <svg
            v-if="loading"
            class="animate-spin"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4 31.4" />
          </svg>
          <span>{{ loading ? 'Searching' : 'Search' }}</span>
        </button>
        <button
          class="search-btn"
          :title="searchModeLabel"
          @click="emit('toggle-search-mode')"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>

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
        class="search-mode-menu"
      >
        <button
          :class="searchMode === 'partial' ? 'active' : ''"
          @click="emit('set-search-mode', 'partial')"
        >
          Partial Match
        </button>
        <button
          :class="searchMode === 'exact' ? 'active' : ''"
          @click="emit('set-search-mode', 'exact')"
        >
          Exact Match
        </button>
      </div>
    </Transition>

    <div class="toolbar-row split">
      <div class="toolbar-left">
        <div class="ctl">
          <select :value="sort" class="ctl-select" @change="onSortChange">
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        <div class="ctl">
          SIZE
          <input
            :value="pageSize"
            type="number"
            min="1"
            max="500"
            class="page-size-input"
            @change="onPageSizeChange"
          />
        </div>

        <button
          v-if="isBackendConnected"
          class="ctl"
          title="Select all records matching current search"
          :disabled="!!selectingAllMatching"
          @click="emit('select-all-matching')"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {{ selectingAllMatching ? 'Selecting...' : 'Select All Matching' }}
        </button>

        <button
          v-if="isBackendConnected && localSyncCount"
          :disabled="syncAllLoading"
          class="ctl"
          @click="emit('open-sync-all')"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          Sync All ({{ localSyncCount }})
        </button>
      </div>

      <div class="toolbar-right">
        <button
          v-if="hasSelection"
          class="btn btn-soft-green"
          style="height: 28px; padding: 0 10px"
          data-test="batch-export-anki-button"
          @click="emit('open-batch-anki-export')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <ellipse cx="12" cy="5" rx="7" ry="3" />
            <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
            <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
          </svg>
          Batch Anki Actions
        </button>
        <button
          v-if="hasSelection"
          class="btn btn-soft-blue"
          style="height: 28px; padding: 0 10px"
          data-test="print-selected-button"
          @click="emit('print-selected')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <path d="M6 14h12v8H6z" />
          </svg>
          Print Selected ({{ selectedCount }})
        </button>
        <button
          v-if="hasSelection"
          class="btn btn-quiet"
          style="height: 28px; padding: 0 10px"
          data-test="clear-selection-button"
          @click="emit('clear-selection')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="8" />
          </svg>
          Clear Selection
        </button>
        <div class="count">{{ totalCount }} words</div>
        <button class="refresh" title="Refresh" @click="emit('refresh')">
          <svg
            :class="{ 'animate-spin': loading }"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  padding: 10px 12px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  display: grid;
  gap: 10px;
}

[data-theme="dark"] .toolbar {
  background: #26231e;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-row.split {
  justify-content: space-between;
  gap: 12px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.search-wrap {
  flex: 1;
  min-width: 280px;
  height: 34px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  color: #8f877e;
  box-shadow: 0 1px 1px rgba(22, 16, 10, 0.018);
}

[data-theme="dark"] .search-wrap {
  background: #201d18;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.18);
}

.search-wrap:focus-within {
  border-color: rgba(36, 114, 83, 0.52);
  box-shadow: 0 0 0 3px rgba(36, 114, 83, 0.1);
}

[data-theme="dark"] .search-wrap:focus-within {
  border-color: rgba(67, 179, 127, 0.52);
  box-shadow: 0 0 0 3px rgba(67, 179, 127, 0.1);
}

.search-wrap input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 13px;
  color: var(--text);
}

.search-wrap input::placeholder {
  color: #9a9389;
}

.search-clear {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #8f877e;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.search-clear:hover,
.search-clear:focus-visible {
  background: rgba(127, 117, 104, 0.14);
  color: var(--text);
}

.search-clear svg {
  stroke-width: 2.2;
  stroke-linecap: round;
}

.search-actions {
  display: flex;
  align-items: center;
}

.search-btn {
  height: 34px;
  border: 0;
  background: var(--green);
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  padding: 0 16px;
  box-shadow: 0 6px 14px rgba(36, 114, 83, 0.14);
  cursor: pointer;
}

.search-btn:first-child {
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

.search-btn:last-child {
  border-left: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  padding: 0 10px;
}

.search-btn:hover {
  background: var(--green-hover);
}

.search-btn:disabled {
  opacity: 0.6;
}

[data-theme="dark"] .search-btn {
  color: #07110c;
  box-shadow: 0 6px 16px rgba(67, 179, 127, 0.16);
}

[data-theme="dark"] .search-btn:last-child {
  border-left: 1px solid rgba(0, 0, 0, 0.16);
}

.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
}

.search-mode-menu {
  position: absolute;
  right: 12px;
  top: 48px;
  z-index: 40;
  width: 176px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  padding: 4px;
}

.search-mode-menu button {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}

.search-mode-menu button:hover {
  background: var(--surface-soft);
}

.search-mode-menu button.active {
  background: var(--green-soft);
  color: var(--green);
  font-weight: 600;
}

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

.ctl:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ctl strong {
  font-weight: 700;
  color: #34302b;
}

[data-theme="dark"] .ctl strong {
  color: #f0e8dd;
}

.page-size-input {
  width: 40px;
  background: transparent;
  border: 0;
  outline: 0;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #34302b;
}

[data-theme="dark"] .page-size-input {
  color: #f0e8dd;
}

.ctl-select {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 12px;
  outline: 0;
  cursor: pointer;
}

.count {
  height: 28px;
  border: 1px solid var(--border);
  background: #f7f3ec;
  color: #625c54;
  border-radius: var(--radius-full);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
}

[data-theme="dark"] .count {
  background: #2b2721;
  color: #d2c8bc;
}

.refresh {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: #7b746b;
  display: grid;
  place-items: center;
  cursor: pointer;
}

[data-theme="dark"] .refresh {
  color: #aaa197;
}

[data-theme="dark"] .refresh:hover {
  color: #fff;
}

/* Button variants */
.btn {
  height: 34px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 560;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}

.btn svg {
  width: 14px;
  height: 14px;
}

.btn-soft-green {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: #1f6a4a;
  font-weight: 620;
}

[data-theme="dark"] .btn-soft-green {
  color: #93e6bb;
}

.btn-soft-blue {
  background: var(--blue-soft);
  border-color: var(--blue-border);
  color: #2452bb;
  font-weight: 620;
}

[data-theme="dark"] .btn-soft-blue {
  color: #adc4ff;
}

.btn-quiet {
  background: var(--surface);
  border-color: var(--border);
  color: #6e6860;
}

[data-theme="dark"] .btn-quiet {
  background: rgba(255, 255, 255, 0.05);
  color: #b6aca1;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
