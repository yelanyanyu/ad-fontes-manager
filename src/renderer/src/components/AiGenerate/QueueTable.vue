<script setup lang="ts">
import { computed } from 'vue';
import {
  buildQueueTableTemplate,
  formatCompactStatus,
  formatJobType,
  formatQueueLanguage,
  formatRunMetricsSummary,
  formatReviewScore,
  reviewScoreClass,
  type QueueTableColumn,
  type QueueTableRow,
} from './queueTable';

const props = defineProps<{
  columns: QueueTableColumn[];
  rows: QueueTableRow[];
  selectedRowId?: string | null;
  emptyText: string;
  loading?: boolean;
  runMetricsExpanded?: boolean;
}>();

const emit = defineEmits<{
  'row-select': [row: QueueTableRow];
  'row-action': [row: QueueTableRow];
  'row-remove': [row: QueueTableRow];
  'row-run-metrics-toggle': [row: QueueTableRow];
  'run-metrics-toggle-all': [];
}>();

const gridTemplateColumns = computed(() => buildQueueTableTemplate(props.columns));
const hasRunMetricsRows = computed(() =>
  props.rows.some(row => Boolean(formatRunMetricsSummary(row.runMetrics)))
);

function rowClass(row: QueueTableRow): Record<string, boolean> {
  return {
    selected: row.id === props.selectedRowId,
    [`q-${row.status}`]: true,
  };
}
</script>

<template>
  <div
    class="queue-table"
    :class="{ loading }"
    :aria-busy="loading || undefined"
  >
    <div
      v-if="rows.length > 0"
      class="queue-table-header"
      :style="{ gridTemplateColumns }"
    >
      <span
        v-for="column in columns"
        :key="column.key"
        class="queue-cell"
        :class="`cell-${column.key}`"
      >
        <button
          v-if="column.key === 'word' && hasRunMetricsRows"
          type="button"
          class="word-header-toggle"
          :title="props.runMetricsExpanded ? 'Collapse Run Metrics' : 'Expand Run Metrics'"
          :aria-label="props.runMetricsExpanded ? 'Collapse Run Metrics' : 'Expand Run Metrics'"
          @click.stop="emit('run-metrics-toggle-all')"
        >
          <span>{{ column.label || '' }}</span>
          <span class="disclosure-icon" aria-hidden="true">
            {{ props.runMetricsExpanded ? '▾' : '▸' }}
          </span>
        </button>
        <template v-else>
          {{ column.label || '' }}
        </template>
      </span>
    </div>

    <template
      v-for="row in rows"
      :key="row.id"
    >
      <div
      class="queue-table-row"
      :class="rowClass(row)"
      :style="{ gridTemplateColumns }"
      role="button"
      tabindex="0"
      @click="emit('row-select', row)"
      @keydown.enter.prevent="emit('row-select', row)"
      @keydown.space.prevent="emit('row-select', row)"
    >
      <span
        v-for="column in columns"
        :key="column.key"
        class="queue-cell"
        :class="`cell-${column.key}`"
      >
        <template v-if="column.key === 'type'">
          <span class="q-dot" :class="row.status" :title="formatCompactStatus(row.status)" />
          <span
            class="q-kind"
            :title="`${formatQueueLanguage(row.language)} · ${formatCompactStatus(row.status)}`"
          >
            {{ formatJobType(row.jobType) }}
          </span>
        </template>

        <span v-else-if="column.key === 'word'" class="q-word">
          <button
            v-if="formatRunMetricsSummary(row.runMetrics)"
            type="button"
            class="row-disclosure-btn"
            :title="row.runMetricsExpanded ? 'Collapse Run Metrics' : 'Expand Run Metrics'"
            :aria-label="`${row.runMetricsExpanded ? 'Collapse' : 'Expand'} Run Metrics for ${row.word}`"
            @click.stop="emit('row-run-metrics-toggle', row)"
          >
            <span class="disclosure-icon" aria-hidden="true">
              {{ row.runMetricsExpanded ? '▾' : '▸' }}
            </span>
          </button>
          <span class="q-word-text">{{ row.word }}</span>
        </span>

        <span v-else-if="column.key === 'language'" class="q-lang">
          {{ formatQueueLanguage(row.language) }}
        </span>

        <span v-else-if="column.key === 'status'" class="q-status">
          {{ formatCompactStatus(row.status) }}
        </span>

        <span
          v-else-if="column.key === 'score'"
          class="score-chip"
          :class="reviewScoreClass(row.score)"
        >
          {{ formatReviewScore(row.score) }}
        </span>

        <span
          v-else-if="column.key === 'improveCount'"
          class="improve-count-chip"
          :class="{ muted: (row.improveCount ?? 0) === 0 }"
        >
          #{{ row.improveCount ?? 0 }}
        </span>

        <span
          v-else-if="column.key === 'note' && row.note"
          class="note-chip"
          :class="`note-${row.note.tone || 'neutral'}`"
          :title="row.note.title"
        >
          {{ row.note.label }}
        </span>

        <button
          v-else-if="column.key === 'action' && row.action"
          type="button"
          class="q-icon-btn"
          :title="row.action.title"
          :aria-label="row.action.title"
          @click.stop="emit('row-action', row)"
        >
          <svg
            v-if="row.action.kind === 'pause'"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>

        <button
          v-else-if="column.key === 'remove'"
          type="button"
          class="q-remove-btn"
          title="Remove"
          aria-label="Remove row"
          @click.stop="emit('row-remove', row)"
        >
          ×
        </button>
      </span>
      </div>

      <div
        v-if="row.runMetricsExpanded && formatRunMetricsSummary(row.runMetrics)"
        class="queue-metrics-row"
      >
        {{ formatRunMetricsSummary(row.runMetrics) }}
      </div>
    </template>

    <div v-if="rows.length === 0" class="queue-table-empty">
      {{ emptyText }}
    </div>
  </div>
</template>

<style scoped>
.queue-table {
  flex: 1;
  overflow: auto;
  padding: 0 14px 10px;
  min-height: 0;
  --queue-gap: 6px;
}

.queue-table-header,
.queue-table-row {
  display: grid;
  column-gap: var(--queue-gap);
  align-items: center;
  min-width: max-content;
}

.queue-table-header {
  position: sticky;
  top: 0;
  z-index: 1;
  min-height: 26px;
  padding: 4px 7px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-panel);
  color: var(--muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.queue-table-row {
  width: 100%;
  min-height: 34px;
  padding: 5px 7px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: initial;
}

.queue-table-row:hover {
  background: var(--surface);
}

.queue-table-row.selected {
  background: var(--green-soft, #e8f5e9);
  box-shadow: inset 3px 0 0 var(--green);
}

.queue-table-row.selected:hover {
  background: var(--green-soft, #e8f5e9);
}

.queue-cell {
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.cell-type,
.cell-score,
.cell-improveCount,
.cell-note,
.cell-action,
.cell-remove {
  display: grid;
  place-items: center;
}

.cell-type {
  grid-template-columns: auto auto;
  justify-content: center;
  gap: 5px;
}

.q-dot {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.q-dot.running { background: var(--blue, #1976d2); }
.q-dot.queued { background: var(--muted); }
.q-dot.paused { background: var(--amber); }
.q-dot.error { background: var(--red); }
.q-dot.complete,
.q-dot.partial { background: var(--green); }

.q-kind {
  display: inline-block;
  width: 34px;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--muted);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  text-transform: uppercase;
}

.q-word {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.q-word-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.word-header-toggle,
.row-disclosure-btn {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.word-header-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  color: inherit;
  font-weight: inherit;
  text-transform: inherit;
}

.row-disclosure-btn {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  color: var(--muted);
}

.row-disclosure-btn:hover,
.word-header-toggle:hover {
  color: var(--green);
}

.disclosure-icon {
  font-size: 10px;
  line-height: 1;
}

.queue-metrics-row {
  margin: -1px 7px 2px 7px;
  padding: 3px 7px 5px;
  border-radius: 0 0 3px 3px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.q-lang,
.q-status {
  color: var(--muted);
  font-size: 10px;
}

.q-running .q-status { color: var(--blue, #1976d2); }
.q-error .q-status { color: var(--red); }
.q-partial .q-status { color: var(--amber); }
.q-complete .q-status { color: var(--green); }

.score-chip,
.improve-count-chip,
.note-chip {
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  line-height: 16px;
  color: var(--muted);
  background: var(--surface);
  white-space: nowrap;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}

.score-chip {
  font-variant-numeric: tabular-nums;
}

.score-strong,
.note-success {
  color: var(--green);
  border-color: var(--green-border);
  background: var(--green-soft);
}

.score-ok,
.note-warning {
  color: var(--amber);
  border-color: var(--amber-border, var(--line));
  background: var(--amber-soft, var(--surface));
}

.score-low,
.note-danger {
  color: var(--red);
  border-color: var(--red-border);
  background: var(--red-soft);
}

.improve-count-chip.muted,
.note-muted {
  color: var(--muted);
  border-color: transparent;
  background: transparent;
}

.q-icon-btn,
.q-remove-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.q-icon-btn {
  color: var(--green);
}

.q-icon-btn:hover {
  border-color: var(--green-border);
  background: var(--green-soft);
}

.q-icon-btn svg {
  width: 12px;
  height: 12px;
}

.q-remove-btn {
  visibility: hidden;
  color: var(--red);
}

.queue-table-row:hover .q-remove-btn {
  visibility: visible;
}

.queue-table-empty {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  padding: 16px;
}
</style>
