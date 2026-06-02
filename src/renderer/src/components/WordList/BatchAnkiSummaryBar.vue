<script setup lang="ts">
import type { BatchAnkiProgress } from '@/types/anki';

interface BatchAnkiStatusSummary {
  imported: number;
  overwritten: number;
  duplicate: number;
  failed: number;
  cancelled: number;
}

defineProps<{
  stageLabel: string;
  progress: BatchAnkiProgress;
  statusSummary: BatchAnkiStatusSummary;
  busy: boolean;
  canCancel: boolean;
  canResume: boolean;
  lastStoppedPhase: 'check' | 'import' | null;
}>();

const emit = defineEmits<{
  open: [];
  cancel: [];
  resume: [];
  close: [];
}>();
</script>

<template>
  <div class="batch-summary-bar">
    <div class="summary-main">
      <div class="summary-metrics">
        <span class="stage-label">
          {{ stageLabel }}
        </span>
        <span class="progress-count">
          {{ progress.processed }}/{{ progress.total }}
        </span>
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{ width: `${progress.percent}%` }"
          />
        </div>
        <span class="status-text">
          imported {{ statusSummary.imported + statusSummary.overwritten }},
          duplicate {{ statusSummary.duplicate }}, failed
          {{ statusSummary.failed }}, cancelled {{ statusSummary.cancelled }}
        </span>
        <span
          v-if="canResume && lastStoppedPhase"
          class="cancelled-label"
        >
          Cancelled during {{ lastStoppedPhase }}
        </span>
      </div>
      <div class="summary-actions">
        <button
          class="ui-button ui-button-secondary summary-button"
          type="button"
          @click="emit('open')"
        >
          Open Batch Panel
        </button>
        <button
          v-if="canCancel"
          class="ui-button ui-button-danger summary-button"
          type="button"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          v-if="canResume"
          class="ui-button ui-button-secondary summary-button resume-button"
          type="button"
          @click="emit('resume')"
        >
          Resume
        </button>
        <button
          class="ui-button ui-button-secondary summary-button"
          type="button"
          :disabled="busy || progress.phase !== 'idle'"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batch-summary-bar {
  min-height: 0;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-soft);
}

.summary-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-metrics {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.stage-label {
  color: var(--blue);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.progress-count,
.status-text {
  color: var(--text-soft);
  font-size: 12px;
  white-space: nowrap;
}

.status-text {
  color: var(--muted);
}

.progress-track {
  width: 176px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface);
}

.progress-fill {
  height: 100%;
  background: var(--blue);
  transition: width 0.3s ease;
}

.cancelled-label {
  color: var(--amber);
  font-size: 12px;
  white-space: nowrap;
}

.summary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-button {
  min-height: 28px;
  padding: 0 8px;
  font-size: 12px;
}

.resume-button {
  color: var(--blue);
  border-color: var(--blue-border);
}

@media (max-width: 980px) {
  .summary-main {
    align-items: flex-start;
    flex-direction: column;
  }

  .summary-metrics {
    width: 100%;
    flex-wrap: wrap;
  }

  .summary-actions {
    flex-wrap: wrap;
  }
}
</style>
