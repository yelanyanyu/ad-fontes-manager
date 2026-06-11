<script setup lang="ts">
import { computed } from 'vue';
import { makeWordSelectionKey } from '@/utils/wordSelection';
import type { WordListColumnKey } from '@/composables/useWordListColumns';
import type { WordRecord } from '@/types/word-list';

const props = defineProps<{
  loading: boolean;
  records: WordRecord[];
  shownColumns: WordListColumnKey[];
  allColumnKeys: WordListColumnKey[];
  columnLabels: Record<WordListColumnKey, string>;
  visibleColumns: Record<WordListColumnKey, boolean>;
  columnMenuOpen: boolean;
  allVisibleSelected: boolean;
  isSelected: (item: WordRecord) => boolean;
  formatColValue: (item: WordRecord, key: WordListColumnKey) => string;
}>();

const emit = defineEmits<{
  'toggle-select-all': [];
  'toggle-selection': [item: WordRecord];
  'toggle-column': [key: WordListColumnKey];
  'toggle-column-menu': [];
  refresh: [];
  preview: [id: string];
  edit: [id: string];
  menu: [id: string];
}>();

const gridTemplateColumns = computed(() => {
  const optionalColumns = props.shownColumns.map(() => 'auto').join(' ');
  return `34px 1fr ${optionalColumns} 122px`;
});

const isOutdatedSchema = (item: WordRecord): boolean => (item as any).is_latest_schema === false;
</script>

<template>
  <div class="table-wrap">
    <div v-if="loading && !records.length" class="table-empty">
      <svg
        class="animate-spin"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4 31.4" />
      </svg>
      <span>Loading records...</span>
    </div>

    <div v-else class="table-shell">
      <div class="thead" :style="{ gridTemplateColumns }">
        <div
          :class="['check', { selected: allVisibleSelected }]"
          role="checkbox"
          :aria-checked="allVisibleSelected"
          aria-label="Select all visible words"
          @click="emit('toggle-select-all')"
        >
          <span v-if="allVisibleSelected">&#10003;</span>
        </div>
        <div>LEMMA</div>
        <div v-for="col in shownColumns" :key="col" class="thead-col">
          {{ columnLabels[col] }}
        </div>
        <div class="right">
          <div class="header-actions">
            <button
              class="ui-control column-control"
              type="button"
              @click.stop="emit('toggle-column-menu')"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
                <path d="M15 4v16" />
                <path d="M3 10h18" />
              </svg>
              Columns
            </button>
            <button
              class="ui-icon-button table-refresh-button"
              type="button"
              title="Refresh"
              aria-label="Refresh word list"
              @click="emit('refresh')"
            >
              <svg
                :class="{ 'animate-spin': loading }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
          </div>
          <div v-if="columnMenuOpen" class="column-menu" @click.stop>
            <label v-for="col in allColumnKeys" :key="col" class="column-menu-item">
              <input
                type="checkbox"
                :checked="visibleColumns[col]"
                @change="emit('toggle-column', col)"
              />
              {{ columnLabels[col] }}
            </label>
          </div>
        </div>
      </div>

      <div
        v-for="item in records"
        :key="makeWordSelectionKey(item)"
        class="trow"
        :style="{ gridTemplateColumns }"
      >
        <div
          :class="['check', { selected: isSelected(item) }]"
          role="checkbox"
          :aria-checked="isSelected(item)"
          :aria-label="`Select ${item.lemma || item.yield?.lemma || item.id}`"
          @click="emit('toggle-selection', item)"
        >
          <span v-if="isSelected(item)">&#10003;</span>
        </div>
        <div class="lemma-cell">
          <span v-if="isOutdatedSchema(item)" class="word-version-badge" aria-label="Old word content">
            旧
          </span>
          <span class="lemma-text">{{ item.lemma || item.yield?.lemma }}</span>
        </div>
        <div v-for="col in shownColumns" :key="col" class="data-cell">
          {{ formatColValue(item, col) }}
        </div>
        <div class="row-actions">
          <button class="action-btn" type="button" title="View" @click="emit('preview', item.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button class="action-btn" type="button" title="Edit" @click="emit('edit', item.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          <button class="action-btn" type="button" title="More" @click="emit('menu', item.id)">
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
</template>

<style scoped>
.table-wrap {
  min-height: 0;
  overflow-y: auto;
  overflow-x: auto;
  background: var(--surface);
  padding: 12px;
}

.table-shell {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--table-field);
}

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

[data-theme='dark'] .thead {
  background: var(--table-head);
  color: #aaa197;
}

.thead .right {
  justify-self: end;
  position: relative;
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.thead-col {
  padding: 0 8px;
  white-space: nowrap;
}

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

[data-theme='dark'] .trow:hover {
  background: #2a251f;
}

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

[data-theme='dark'] .check {
  border-color: #575047;
  background: #201d18;
  color: #06100b;
}

.check.selected {
  background: var(--green);
  border-color: var(--green);
}

.lemma-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-family: var(--serif);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.025em;
  color: #27231f;
  padding: 0 8px;
}

.lemma-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-theme='dark'] .lemma-cell {
  color: #eee8de;
}

.data-cell {
  padding: 0 8px;
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

.word-version-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid rgba(176, 103, 25, 0.32);
  border-radius: var(--radius-sm);
  background: rgba(176, 103, 25, 0.12);
  color: #8a4d13;
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0;
}

[data-theme='dark'] .word-version-badge {
  border-color: rgba(230, 159, 76, 0.34);
  background: rgba(230, 159, 76, 0.14);
  color: #e1a157;
}

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
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
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

[data-theme='dark'] .action-btn {
  background: rgba(255, 255, 255, 0.045);
  color: #bdb3a7;
}

[data-theme='dark'] .action-btn:hover {
  background: rgba(255, 255, 255, 0.065);
  color: #fff;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--muted);
  font-size: 13px;
}

.column-control {
  min-height: 26px;
}

.table-refresh-button {
  width: 30px;
  height: 30px;
}

.table-refresh-button svg {
  width: 15px;
  height: 15px;
  stroke-width: 2;
}

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

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
