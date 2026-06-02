<script setup lang="ts">
import type { WorksetJob } from '@/composables/useAiGenerate';
import { formatReviewScore, reviewScoreClass } from './queueTable';

defineProps<{
  open: boolean;
  jobs: WorksetJob[];
  improving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  remove: [jobId: string];
  submit: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ui-dialog-overlay pending-improve-overlay"
      role="presentation"
      @click.self="emit('close')"
    >
      <section
        class="ui-dialog-card ui-dialog-card--wide pending-improve-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-improve-title"
      >
        <div class="ui-dialog-head pending-improve-head">
          <div>
            <strong id="pending-improve-title">Pending Improve Selection</strong>
            <p>Review low-score words before creating Improve jobs.</p>
          </div>
          <span>{{ jobs.length }} selected</span>
        </div>

        <div class="ui-dialog-body pending-improve-list">
          <div v-for="job in jobs" :key="job.jobId" class="pending-improve-row">
            <span class="pending-word">{{ job.word }}</span>
            <span
              class="ui-chip score-chip"
              :class="reviewScoreClass(job.effectiveReviewScore)"
            >
              {{ formatReviewScore(job.effectiveReviewScore) }}
            </span>
            <span class="ui-chip ui-chip--neutral improve-count-chip">#{{ job.improveCount }}</span>
            <button
              type="button"
              class="ui-button ui-button--quiet queue-button"
              :disabled="improving"
              @click="emit('remove', job.jobId)"
            >
              Remove
            </button>
          </div>
          <div v-if="jobs.length === 0" class="bar-empty-list">
            No selected jobs
          </div>
        </div>

        <div class="ui-dialog-actions pending-improve-actions">
          <button
            type="button"
            class="ui-button ui-button--quiet queue-button"
            :disabled="improving"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="ui-button ui-button--primary queue-button"
            :disabled="jobs.length === 0 || improving"
            @click="emit('submit')"
          >
            Create Improve Jobs
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.pending-improve-overlay {
  z-index: 2400;
  padding: 24px;
  background: rgb(17 24 39 / 0.28);
}

.pending-improve-panel {
  width: min(560px, calc(100vw - 32px));
  max-height: min(620px, calc(100vh - 48px));
  border-radius: 8px;
  box-shadow: 0 24px 70px rgb(15 23 42 / 0.22);
}

.pending-improve-head,
.pending-improve-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  font-size: 12px;
}

.pending-improve-head strong {
  display: block;
  font-size: 14px;
  color: var(--text);
}

.pending-improve-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.pending-improve-head span {
  color: var(--muted);
  white-space: nowrap;
}

.pending-improve-list {
  min-height: 96px;
  max-height: min(380px, calc(100vh - 220px));
  padding: 0;
}

.pending-improve-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}

.pending-improve-row:last-child {
  border-bottom: 0;
}

.pending-word {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-button {
  height: 24px;
  padding: 0 10px;
  border-radius: 3px;
  font-size: 11px;
}

.bar-empty-list {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  padding: 16px;
}

.score-chip {
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.score-strong {
  color: var(--green);
  border-color: var(--green-border);
  background: var(--green-soft);
}

.score-ok {
  color: var(--amber);
  border-color: var(--amber-border, var(--line));
  background: var(--amber-soft, var(--surface));
}

.score-low {
  color: var(--red);
  border-color: var(--red-border);
  background: var(--red-soft);
}

.improve-count-chip {
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
