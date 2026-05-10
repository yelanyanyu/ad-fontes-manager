<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { AI_STATE_KEY } from '@/composables/useAiGenerate';

const emit = defineEmits<{
  'expanded-change': [expanded: boolean];
  'job-selected': [jobId: string];
}>();

const {
  queueOverview,
  fetchQueueOverview,
  queueCancelAll,
  queuePauseAll,
  queueResumeAll,
  cancelGeneration,
  selectJob,
  selectedJobId,
} = inject(AI_STATE_KEY)!;

const expanded = ref(false);

onMounted(() => {
  fetchQueueOverview();
});

const counts = computed(() => {
  const c = { running: 0, queued: 0, paused: 0, error: 0, done: 0 };
  for (const j of queueOverview.value) {
    if (j.status === 'running') c.running++;
    else if (j.status === 'queued') c.queued++;
    else if (j.status === 'paused') c.paused++;
    else if (j.status === 'error') c.error++;
    else c.done++;
  }
  return c;
});

const total = computed(() => queueOverview.value.length);

function toggleExpand(): void {
  expanded.value = !expanded.value;
  emit('expanded-change', expanded.value);
  if (expanded.value) fetchQueueOverview();
}

async function handleCancelAll(): Promise<void> {
  if (!confirm('Cancel ALL jobs?')) return;
  await queueCancelAll();
}

async function handlePauseAll(): Promise<void> {
  await queuePauseAll();
}

async function handleResumeAll(): Promise<void> {
  await queueResumeAll();
}

function handleSelect(jobId: string): void {
  selectJob(jobId);
  emit('job-selected', jobId);
}
</script>

<template>
  <div class="queue-bar" :class="{ expanded }">
    <div class="bar-summary" @click="toggleExpand">
      <span class="bar-label">Queue</span>
      <span v-if="total === 0" class="bar-empty">empty</span>
      <template v-else>
        <span v-if="counts.running" class="bar-count running">{{ counts.running }}r</span>
        <span v-if="counts.queued" class="bar-count queued">{{ counts.queued }}q</span>
        <span v-if="counts.paused" class="bar-count paused">{{ counts.paused }}p</span>
        <span v-if="counts.error" class="bar-count error">{{ counts.error }}e</span>
        <span v-if="counts.done || !total" class="bar-count done">{{ counts.done }}d</span>
      </template>
      <span class="bar-chevron">{{ expanded ? '▼' : '▲' }}</span>
    </div>

    <div v-if="expanded" class="bar-panel">
      <div class="bar-actions">
        <button type="button" class="qbtn" @click="handlePauseAll">Pause</button>
        <button type="button" class="qbtn" @click="handleResumeAll">Resume</button>
        <button type="button" class="qbtn danger" @click="handleCancelAll">Clear</button>
      </div>
      <div class="bar-list">
        <div
          v-for="qj in queueOverview"
          :key="qj.jobId"
          class="bar-row"
          :class="{ selected: qj.jobId === selectedJobId, ['q-' + qj.status]: true }"
          @click="handleSelect(qj.jobId)"
        >
          <span class="q-dot" :class="qj.status" />
          <span class="q-kind">{{ qj.jobType === 'fix' ? 'fix' : 'gen' }}</span>
          <span class="q-word">{{ qj.word }}</span>
          <span class="q-lang">{{ qj.language === 'de' ? 'DE' : 'EN' }}</span>
          <span class="q-status">{{ qj.status }}</span>
          <button
            type="button"
            class="qbtn danger q-close"
            title="Remove"
            @click.stop="cancelGeneration(qj.jobId)"
          >
            ×
          </button>
        </div>
        <div v-if="queueOverview.length === 0" class="bar-empty-list">No active jobs</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue-bar {
  background: var(--surface-panel);
  border-top: 1px solid var(--line);
  user-select: none;
  display: flex;
  flex-direction: column;
  min-height: 29px;
  transition:
    flex-basis 0.22s ease,
    min-height 0.22s ease;
}

.bar-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px;
  cursor: pointer;
  font-size: 12px;
  min-height: 28px;
  flex: 0 0 auto;
}

.bar-summary:hover {
  background: var(--surface);
}

.bar-label {
  font-weight: 650;
  color: var(--text);
  margin-right: 4px;
}

.bar-empty {
  color: var(--muted);
}

.bar-count {
  padding: 0 6px;
  border-radius: 3px;
  font-weight: 650;
  font-size: 11px;
}

.bar-count.running { background: var(--blue-soft, #e3f2fd); color: var(--blue, #1976d2); }
.bar-count.queued  { background: var(--surface); color: var(--muted); border: 1px solid var(--line); }
.bar-count.paused  { background: var(--amber-soft, #fff8e1); color: var(--amber); }
.bar-count.error   { background: var(--red-soft); color: var(--red); }
.bar-count.done    { color: var(--muted); }

.bar-chevron {
  margin-left: auto;
  color: var(--muted);
  font-size: 10px;
}

.bar-panel {
  border-top: 1px solid var(--line);
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.7), transparent 56px),
    var(--surface-panel);
}

.bar-actions {
  display: flex;
  gap: 6px;
  padding: 6px 14px;
  flex: 0 0 auto;
}

.qbtn {
  padding: 2px 10px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface);
  cursor: pointer;
  font-size: 11px;
  color: var(--text);
}

.qbtn.danger {
  border-color: var(--red-border);
  color: var(--red);
}

.bar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px 10px;
  min-height: 0;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 5px 7px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
}

.bar-row:hover {
  background: var(--surface);
}

.bar-row.selected {
  background: var(--green-soft, #e8f5e9);
}

.q-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.q-dot.running { background: var(--blue, #1976d2); }
.q-dot.queued  { background: var(--muted); }
.q-dot.paused  { background: var(--amber); }
.q-dot.error   { background: var(--red); }
.q-dot.complete,
.q-dot.partial  { background: var(--green); }

.q-kind {
  width: 28px;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--muted);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  text-transform: uppercase;
}

.q-word { flex: 1; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-lang { color: var(--muted); font-size: 10px; min-width: 20px; }
.q-status { font-size: 10px; min-width: 56px; text-align: right; color: var(--muted); }

.q-running .q-status { color: var(--blue, #1976d2); }
.q-error .q-status { color: var(--red); }

.q-close {
  visibility: hidden;
  padding: 0 5px;
}

.bar-row:hover .q-close {
  visibility: visible;
}

.bar-empty-list {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  padding: 16px;
}
</style>
