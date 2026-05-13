<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import {
  AI_STATE_KEY,
  type QueueHistoryJob,
  type QueueHistoryStatus,
  type WorksetSaveResponse,
} from '@/composables/useAiGenerate';
import { useAppStore } from '@/stores/appStore';
import { useWordStore } from '@/stores/wordStore';
import {
  describeWorksetSaveResult,
  type WorksetSaveDetail,
} from '@/services/worksetSaveResult';

const emit = defineEmits<{
  'expanded-change': [expanded: boolean];
  'job-selected': [jobId: string];
  'history-job-selected': [job: QueueHistoryJob];
}>();

const {
  queueOverview,
  queueHistory,
  queueHistoryTotal,
  queueHistoryPage,
  queueHistoryPageSize,
  queueHistoryStatus,
  queueHistoryQuery,
  queueHistoryLoading,
  todayWorkset,
  todayWorksetTotal,
  fetchQueueOverview,
  fetchQueueHistory,
  fetchTodayWorkset,
  saveTodayWorkset,
  queueCancelAll,
  queuePauseAll,
  queueResumeAll,
  cancelGeneration,
  pauseGeneration,
  resumeActiveGeneration,
  deleteHistoryJob,
  clearQueueHistory,
  selectJob,
  selectedJobId,
} = inject(AI_STATE_KEY)!;

const appStore = useAppStore();
const wordStore = useWordStore();
const expanded = ref(false);
const mode = ref<'active' | 'history' | 'workset'>('active');
const historySearch = ref('');
const savingWorkset = ref(false);
const worksetSaveResults = ref(new Map<string, WorksetSaveDetail>());

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
const historyPages = computed(() =>
  Math.max(1, Math.ceil(queueHistoryTotal.value / queueHistoryPageSize.value))
);
const worksetSaveSummary = computed(() => {
  const summary = { saved: 0, conflict: 0, invalid: 0, missing: 0, error: 0 };
  for (const detail of worksetSaveResults.value.values()) {
    summary[detail.status]++;
  }
  return summary;
});
const conflictJobIds = computed(() =>
  [...worksetSaveResults.value.entries()]
    .filter(([, detail]) => detail.status === 'conflict')
    .map(([jobId]) => jobId)
);

function formatFinalScore(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '--';
  return `${score}/10`;
}

function finalScoreClass(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'score-missing';
  if (score >= 8) return 'score-strong';
  if (score >= 6) return 'score-ok';
  return 'score-low';
}

function recordWorksetSave(response: WorksetSaveResponse): void {
  const next = new Map(worksetSaveResults.value);
  for (const item of response.results) {
    next.set(item.jobId, describeWorksetSaveResult(item.result));
  }
  for (const jobId of response.missing) {
    next.set(jobId, {
      status: 'missing',
      label: 'missing',
      message: 'No saveable YAML result was found for this Job.',
    });
  }
  worksetSaveResults.value = next;
}

function toggleExpand(): void {
  expanded.value = !expanded.value;
  emit('expanded-change', expanded.value);
  if (expanded.value) {
    if (mode.value === 'active') fetchQueueOverview();
    else if (mode.value === 'history') fetchQueueHistory();
    else fetchTodayWorkset();
  }
}

async function setMode(nextMode: 'active' | 'history' | 'workset'): Promise<void> {
  mode.value = nextMode;
  if (nextMode === 'active') {
    await fetchQueueOverview();
  } else if (nextMode === 'history') {
    await fetchQueueHistory({ page: 1 });
    historySearch.value = queueHistoryQuery.value;
  } else {
    worksetSaveResults.value = new Map();
    await fetchTodayWorkset();
  }
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

async function handlePauseJob(jobId: string): Promise<void> {
  await pauseGeneration(jobId);
}

async function handleResumeJob(jobId: string): Promise<void> {
  await resumeActiveGeneration(jobId);
}

function handleSelect(jobId: string): void {
  selectJob(jobId);
  emit('job-selected', jobId);
}

async function applyHistorySearch(): Promise<void> {
  await fetchQueueHistory({ page: 1, query: historySearch.value });
}

async function setHistoryStatus(status: QueueHistoryStatus | null): Promise<void> {
  await fetchQueueHistory({ page: 1, status });
}

async function gotoHistoryPage(page: number): Promise<void> {
  const next = Math.max(1, Math.min(historyPages.value, page));
  await fetchQueueHistory({ page: next });
}

function handleHistorySelect(job: QueueHistoryJob): void {
  emit('history-job-selected', job);
}

async function handleSaveWorkset(): Promise<void> {
  if (todayWorkset.value.length === 0 || savingWorkset.value) return;
  if (!confirm(`Save ${todayWorkset.value.length} latest YAML results to DB?`)) return;

  savingWorkset.value = true;
  try {
    const result = await saveTodayWorkset();
    recordWorksetSave(result);
    if (result.saved > 0) {
      appStore.addToast(`Saved ${result.saved} workset words`, 'success');
      await wordStore.fetchDbRecords({ background: true });
    }
    if (result.conflicts || result.failed || result.missing.length) {
      appStore.addToast(
        `Not saved: ${result.conflicts} conflict, ${result.failed} failed, ${result.missing.length} missing`,
        'warning'
      );
    }
  } finally {
    savingWorkset.value = false;
  }
}

async function handleOverwriteConflicts(): Promise<void> {
  if (conflictJobIds.value.length === 0 || savingWorkset.value) return;
  if (!confirm(`Overwrite ${conflictJobIds.value.length} conflicting words?`)) return;

  savingWorkset.value = true;
  try {
    const result = await saveTodayWorkset(conflictJobIds.value, { forceUpdate: true });
    recordWorksetSave(result);
    if (result.saved > 0) {
      appStore.addToast(`Overwrote ${result.saved} workset conflicts`, 'success');
      await wordStore.fetchDbRecords({ background: true });
    }
    if (result.failed || result.missing.length) {
      appStore.addToast(
        `Still not saved: ${result.failed} failed, ${result.missing.length} missing`,
        'warning'
      );
    }
  } finally {
    savingWorkset.value = false;
  }
}

async function handleDeleteHistoryJob(jobId: string): Promise<void> {
  await deleteHistoryJob(jobId);
}

async function handleClearHistory(): Promise<void> {
  const totalLabel = queueHistoryTotal.value || queueHistory.value.length;
  if (!confirm(`Delete ${totalLabel} history jobs?`)) return;
  await clearQueueHistory();
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
      <div class="mode-row">
        <div class="mode-control" aria-label="Queue mode">
          <button
            type="button"
            :class="{ active: mode === 'active' }"
            @click="setMode('active')"
          >
            Active
          </button>
          <button
            type="button"
            :class="{ active: mode === 'history' }"
            @click="setMode('history')"
          >
            History
          </button>
          <button
            type="button"
            :class="{ active: mode === 'workset' }"
            @click="setMode('workset')"
          >
            Today
          </button>
        </div>
      </div>

      <div v-if="mode === 'active'" class="bar-actions">
        <button type="button" class="qbtn" @click="handlePauseAll">Pause</button>
        <button type="button" class="qbtn" @click="handleResumeAll">Resume</button>
        <button type="button" class="qbtn danger" @click="handleCancelAll">Clear</button>
      </div>

      <div v-if="mode === 'active'" class="bar-list">
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
            v-if="qj.status === 'running' || qj.status === 'queued'"
            type="button"
            class="q-icon-btn"
            title="Pause"
            aria-label="Pause job"
            @click.stop="handlePauseJob(qj.jobId)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
          </button>
          <button
            v-else-if="qj.status === 'paused'"
            type="button"
            class="q-icon-btn"
            title="Resume"
            aria-label="Resume job"
            @click.stop="handleResumeJob(qj.jobId)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
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

      <div v-else-if="mode === 'history'" class="history-panel">
        <div class="history-tools">
          <form class="history-search" @submit.prevent="applyHistorySearch">
            <input v-model="historySearch" type="search" placeholder="Search lemma" />
            <button type="submit" class="qbtn">Search</button>
          </form>
          <button type="button" class="qbtn danger" @click="handleClearHistory">
            Clear History
          </button>
        </div>

        <div class="status-tabs">
          <button
            type="button"
            :class="{ active: !queueHistoryStatus }"
            @click="setHistoryStatus(null)"
          >
            All
          </button>
          <button
            type="button"
            :class="{ active: queueHistoryStatus === 'error' }"
            @click="setHistoryStatus('error')"
          >
            Error
          </button>
          <button
            type="button"
            :class="{ active: queueHistoryStatus === 'partial' }"
            @click="setHistoryStatus('partial')"
          >
            Partial
          </button>
          <button
            type="button"
            :class="{ active: queueHistoryStatus === 'complete' }"
            @click="setHistoryStatus('complete')"
          >
            Complete
          </button>
        </div>

        <div
          class="bar-list history-list"
          :class="{ loading: queueHistoryLoading }"
          :aria-busy="queueHistoryLoading"
        >
          <div
            v-for="job in queueHistory"
            :key="job.jobId"
            class="bar-row history-row"
            :class="`q-${job.status}`"
            @click="handleHistorySelect(job)"
          >
            <span class="q-dot" :class="job.status" />
            <span class="q-kind">{{ job.jobType === 'fix' ? 'fix' : 'gen' }}</span>
            <span class="q-word">{{ job.word }}</span>
            <span class="q-status">{{ job.status }}</span>
            <button
              type="button"
              class="qbtn danger q-close"
              title="Delete"
              @click.stop="handleDeleteHistoryJob(job.jobId)"
            >
              ×
            </button>
          </div>
          <div v-if="queueHistory.length === 0" class="bar-empty-list">No history jobs</div>
        </div>

        <div class="history-pager">
          <span>{{ queueHistoryTotal }} jobs</span>
          <div>
            <button
              type="button"
              class="qbtn"
              :disabled="queueHistoryPage <= 1"
              @click="gotoHistoryPage(queueHistoryPage - 1)"
            >
              Prev
            </button>
            <span>{{ queueHistoryPage }} / {{ historyPages }}</span>
            <button
              type="button"
              class="qbtn"
              :disabled="queueHistoryPage >= historyPages"
              @click="gotoHistoryPage(queueHistoryPage + 1)"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div v-else class="workset-panel">
        <div class="workset-tools">
          <div class="workset-summary">
            <strong>{{ todayWorksetTotal }}</strong>
            <span>latest today</span>
          </div>
          <button
            type="button"
            class="qbtn"
            :disabled="todayWorkset.length === 0 || savingWorkset"
            @click="fetchTodayWorkset"
          >
            Refresh
          </button>
          <button
            type="button"
            class="qbtn primary"
            :disabled="todayWorkset.length === 0 || savingWorkset"
            @click="handleSaveWorkset"
          >
            Save All
          </button>
          <button
            v-if="conflictJobIds.length > 0"
            type="button"
            class="qbtn danger"
            :disabled="savingWorkset"
            @click="handleOverwriteConflicts"
          >
            Overwrite Conflicts
          </button>
        </div>

        <div v-if="worksetSaveResults.size > 0" class="workset-result-summary">
          <span v-if="worksetSaveSummary.saved">Saved {{ worksetSaveSummary.saved }}</span>
          <span v-if="worksetSaveSummary.conflict" class="is-warning">
            Conflict {{ worksetSaveSummary.conflict }}
          </span>
          <span v-if="worksetSaveSummary.invalid" class="is-danger">
            Invalid {{ worksetSaveSummary.invalid }}
          </span>
          <span v-if="worksetSaveSummary.error" class="is-danger">
            Error {{ worksetSaveSummary.error }}
          </span>
          <span v-if="worksetSaveSummary.missing" class="is-muted">
            Missing {{ worksetSaveSummary.missing }}
          </span>
        </div>

        <div class="bar-list workset-list">
          <div
            v-for="job in todayWorkset"
            :key="job.jobId"
            class="bar-row workset-row"
            :class="`q-${job.status}`"
            @click="handleHistorySelect(job)"
          >
            <span class="q-dot" :class="job.status" />
            <span class="q-kind">{{ job.jobType === 'fix' ? 'fix' : 'gen' }}</span>
            <span class="q-word">{{ job.word }}</span>
            <span class="q-lang">{{ job.language === 'de' ? 'DE' : 'EN' }}</span>
            <span class="q-status">{{ job.status }}</span>
            <span
              class="score-chip"
              :class="finalScoreClass(job.finalScore)"
              title="Final review score"
            >
              {{ formatFinalScore(job.finalScore) }}
            </span>
            <span
              v-if="worksetSaveResults.get(job.jobId)"
              class="save-chip"
              :class="`save-${worksetSaveResults.get(job.jobId)?.status}`"
              :title="worksetSaveResults.get(job.jobId)?.message"
            >
              {{ worksetSaveResults.get(job.jobId)?.label }}
            </span>
          </div>
          <div v-if="todayWorkset.length === 0" class="bar-empty-list">
            No latest results today
          </div>
        </div>
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
  background: var(--surface-panel);
}

.bar-actions {
  display: flex;
  gap: 6px;
  padding: 6px 14px;
  flex: 0 0 auto;
}

.mode-row {
  padding: 8px 14px 0;
}

.mode-control {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--line);
  border-radius: 4px;
  overflow: hidden;
  background: var(--surface-soft);
}

.mode-control button,
.status-tabs button {
  border: 0;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
  height: 26px;
}

.mode-control button + button {
  border-left: 1px solid var(--line);
}

.mode-control button.active,
.status-tabs button.active {
  background: var(--green-soft, #e8f5e9);
  color: var(--green);
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

.qbtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.qbtn.danger {
  border-color: var(--red-border);
  color: var(--red);
}

.qbtn.primary {
  border-color: var(--green-border);
  background: var(--green);
  color: #fff;
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
.q-partial .q-status { color: var(--amber); }
.q-complete .q-status { color: var(--green); }

.q-close {
  visibility: hidden;
  padding: 0 5px;
}

.q-icon-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
  color: var(--green);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.q-icon-btn:hover {
  border-color: var(--green-border);
  background: var(--green-soft);
}

.q-icon-btn svg {
  width: 12px;
  height: 12px;
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

.history-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workset-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workset-tools {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 6px;
  padding: 6px 14px;
  align-items: center;
}

.workset-summary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
}

.workset-summary strong {
  color: var(--text);
  font-size: 13px;
}

.workset-result-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 6px;
  color: var(--green);
  font-size: 11px;
  min-height: 20px;
  flex-wrap: wrap;
}

.workset-result-summary span {
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 1px 6px;
  background: var(--surface);
}

.workset-result-summary .is-warning {
  color: var(--amber);
  border-color: var(--amber-border, var(--line));
}

.workset-result-summary .is-danger {
  color: var(--red);
  border-color: var(--red-border);
}

.workset-result-summary .is-muted {
  color: var(--muted);
}

.workset-list {
  padding-bottom: 8px;
}

.workset-row {
  grid-template-columns: auto auto minmax(0, 1fr) auto auto auto auto;
}

.score-chip {
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  background: var(--surface);
  white-space: nowrap;
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

.save-chip {
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  line-height: 16px;
  text-transform: uppercase;
  color: var(--muted);
  background: var(--surface);
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-saved {
  border-color: var(--green-border);
  color: var(--green);
  background: var(--green-soft);
}

.save-conflict {
  color: var(--amber);
  border-color: var(--amber-border, var(--line));
  background: var(--amber-soft, var(--surface));
}

.save-invalid,
.save-error {
  color: var(--red);
  border-color: var(--red-border);
  background: var(--red-soft);
}

.save-missing {
  color: var(--muted);
}

.history-tools {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  padding: 6px 14px;
}

.history-search {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.history-search input {
  min-width: 0;
  flex: 1;
  height: 24px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface);
  color: var(--text);
  padding: 0 8px;
  font-size: 11px;
  outline: 0;
}

.history-search input:focus {
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
}

.status-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  padding: 0 14px 6px;
}

.status-tabs button {
  border: 1px solid var(--line);
  border-radius: 3px;
}

.history-list {
  padding-bottom: 4px;
}

.history-list.loading {
  opacity: 0.72;
  transition: opacity 0.12s ease;
}

.history-row {
  grid-template-columns: auto auto minmax(0, 1fr) auto auto;
}

.history-pager {
  border-top: 1px solid var(--line);
  padding: 7px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}

.history-pager div {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
