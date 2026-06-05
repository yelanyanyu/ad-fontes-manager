<script setup lang="ts">
import { computed } from 'vue';
import type { JobState, StepState } from '@/composables/useAiGenerate';
import { formatDurationMs } from './queueTable';

const props = defineProps<{
  job: JobState;
  steps: StepState[];
  running: boolean;
}>();

const emit = defineEmits<{
  details: [step: StepState];
  regenerate: [step: StepState];
}>();

const progressPercent = computed(() => {
  const complete = props.steps.filter(step => step.status === 'complete').length;
  const total = props.steps.length || 3;
  return Math.min(100, Math.round((complete / total) * 100));
});

function formatStageMeta(step: StepState): string {
  const duration = formatDurationMs(step.duration);
  return duration ? `${duration} · ${step.status}` : step.status;
}
</script>

<template>
  <section class="progress-section" data-tour="ai-generate-progress">
    <div class="progress-head">
      <div class="job-title">
        <strong>{{ job.word }}</strong>
        <span>{{ job.language === 'de' ? 'German' : 'English' }}</span>
      </div>
      <span :class="`status-chip chip-${job.status}`">{{ job.status }}</span>
      <strong>{{ progressPercent }}%</strong>
    </div>
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
    </div>

    <div class="stage-list">
      <div
        v-for="step in steps"
        :key="step.step"
        class="stage-row"
        :class="`stage-${step.status}`"
      >
        <span class="stage-name">{{ step.step }}</span>
        <span class="stage-meta">
          {{ formatStageMeta(step) }}
        </span>
        <div class="stage-actions">
          <button
            v-if="step.status === 'complete' || step.status === 'error'"
            type="button"
            class="stage-action-btn regenerate"
            :disabled="running"
            @click="emit('regenerate', step)"
          >
            Regenerate from
          </button>
          <button
            type="button"
            class="stage-action-btn"
            @click="emit('details', step)"
          >
            Details
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.progress-section {
  display: grid;
  gap: 10px;
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.job-title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
}

.job-title strong {
  color: var(--text);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-title span {
  color: var(--muted);
  font-size: 11px;
}

.progress-track {
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--faint);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.18s ease;
}

.stage-list {
  display: grid;
  gap: 6px;
}

.stage-row {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.stage-name {
  font-size: 13px;
  font-weight: 650;
  text-transform: capitalize;
  flex: 1;
  min-width: 0;
}

.stage-meta {
  color: var(--muted);
  font-size: 12px;
  flex-shrink: 0;
}

.stage-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.stage-action-btn {
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--text-soft);
  padding: 0 9px;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}

.stage-action-btn:hover {
  border-color: var(--green-border);
  color: var(--green);
}

.stage-action-btn.regenerate {
  color: var(--green);
}

.stage-action-btn.regenerate:hover {
  border-color: var(--green-border);
  background: var(--green-soft);
}

.stage-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.stage-complete {
  border-color: var(--green-border);
}

.stage-error {
  border-color: var(--red-border);
}

.stage-running {
  border-color: var(--amber);
}

.stage-pending {
  border-color: var(--line);
  opacity: 0.55;
}

.status-chip {
  border-radius: var(--radius-full);
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 650;
  text-transform: capitalize;
}

.chip-complete {
  background: var(--green-soft);
  color: var(--green);
}

.chip-partial {
  background: var(--amber-soft, #fff8e1);
  color: var(--amber);
}

.chip-running {
  background: var(--blue-soft, #e3f2fd);
  color: var(--blue, #1976d2);
}

.chip-paused {
  background: var(--amber-soft, #fff8e1);
  color: var(--amber);
}

.chip-error {
  background: var(--red-soft);
  color: var(--red);
}

.chip-queued {
  background: var(--surface);
  color: var(--muted);
}
</style>
