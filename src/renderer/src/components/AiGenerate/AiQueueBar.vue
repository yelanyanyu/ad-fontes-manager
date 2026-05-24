<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import {
  AI_STATE_KEY,
  type QueueHistoryJob,
  type QueueHistoryStatus,
  type WorksetJob,
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
  improveTodayWorkset,
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
const improvingWorkset = ref(false);
const improveSelectionOpen = ref(false);
const pendingImproveJobIds = ref(new Set<string>());
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
const eligibleWorksetJobs = computed(() => todayWorkset.value.filter(job => job.improveEligible));
const pendingImproveJobs = computed(() =>
  todayWorkset.value.filter(job => pendingImproveJobIds.value.has(job.jobId))
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

function formatBlockedReason(reason: WorksetJob['improveBlockedReason']): string {
  switch (reason) {
    case 'score-not-low':
      return '';
    case 'partial-result':
      return 'partial';
    case 'audit-incomplete':
      return 'audit';
    case 'missing-revision-notes':
      return 'no notes';
    default:
      return 'blocked';
  }
}

function shouldShowBlockedReason(reason: WorksetJob['improveBlockedReason']): boolean {
  return Boolean(reason && reason !== 'score-not-low');
}

function formatCompactStatus(status: string): string {
  switch (status) {
    case 'complete':
      return 'done';
    case 'partial':
      return 'part';
    case 'running':
      return 'run';
    case 'queued':
      return 'queue';
    default:
      return status;
  }
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

function openImproveSelection(): void {
  if (eligibleWorksetJobs.value.length === 0) {
    appStore.addToast('No low-score Workset jobs are eligible for Improve.', 'info');
    return;
  }
  pendingImproveJobIds.value = new Set(eligibleWorksetJobs.value.map(job => job.jobId));
  improveSelectionOpen.value = true;
}

function removePendingImproveJob(jobId: string): void {
  const next = new Set(pendingImproveJobIds.value);
  next.delete(jobId);
  pendingImproveJobIds.value = next;
}

function closeImproveSelection(): void {
  improveSelectionOpen.value = false;
  pendingImproveJobIds.value = new Set();
}

async function submitWorksetImprove(): Promise<void> {
  const jobIds = [...pendingImproveJobIds.value];
  if (jobIds.length === 0 || improvingWorkset.value) return;

  improvingWorkset.value = true;
  try {
    const result = await improveTodayWorkset(jobIds);
    if (result.jobs.length > 0) {
      appStore.addToast(`Created ${result.jobs.length} Improve jobs`, 'success');
    }
    if (result.blocked.length || result.missing.length) {
      appStore.addToast(
        `Skipped ${result.blocked.length + result.missing.length} Workset items`,
        'warning'
      );
    }
    closeImproveSelection();
  } finally {
    improvingWorkset.value = false;
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
  <div class="queue-bar" :class="{ expanded }" data-tour="ai-generate-queue">
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

      <div v-if="mode === 'active'" class="bar-list queue-table queue-table-active">
        <div v-if="queueOverview.length > 0" class="queue-table-header">
          <span class="queue-cell cell-type">Type</span>
          <span class="queue-cell cell-word">Word</span>
          <span class="queue-cell cell-lang">Lang</span>
          <span class="queue-cell cell-state">Status</span>
          <span class="queue-cell cell-action">Act</span>
          <span class="queue-cell cell-remove" />
        </div>
        <div
          v-for="qj in queueOverview"
          :key="qj.jobId"
          class="bar-row queue-table-row"
          :class="{ selected: qj.jobId === selectedJobId, ['q-' + qj.status]: true }"
          @click="handleSelect(qj.jobId)"
        >
          <span class="queue-cell cell-type">
            <span class="q-dot" :class="qj.status" />
            <span class="q-kind">{{ qj.jobType === 'fix' ? 'fix' : 'gen' }}</span>
          </span>
          <span class="queue-cell cell-word q-word">{{ qj.word }}</span>
          <span class="queue-cell cell-lang q-lang">{{ qj.language === 'de' ? 'DE' : 'EN' }}</span>
          <span class="queue-cell cell-state q-status">{{ formatCompactStatus(qj.status) }}</span>
          <button
            v-if="qj.status === 'running' || qj.status === 'queued'"
            type="button"
            class="queue-cell cell-action q-icon-btn"
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
            class="queue-cell cell-action q-icon-btn"
            title="Resume"
            aria-label="Resume job"
            @click.stop="handleResumeJob(qj.jobId)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <span v-else class="queue-cell cell-action q-action-placeholder" aria-hidden="true" />
          <button
            type="button"
            class="queue-cell cell-remove qbtn danger q-close"
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
          class="bar-list history-list queue-table queue-table-history"
          :class="{ loading: queueHistoryLoading }"
          :aria-busy="queueHistoryLoading"
        >
          <div v-if="queueHistory.length > 0" class="queue-table-header">
            <span class="queue-cell cell-type">Type</span>
            <span class="queue-cell cell-word">Word</span>
            <span class="queue-cell cell-state">Status</span>
            <span class="queue-cell cell-remove" />
          </div>
          <div
            v-for="job in queueHistory"
            :key="job.jobId"
            class="bar-row queue-table-row"
            :class="{ selected: job.jobId === selectedJobId, ['q-' + job.status]: true }"
            @click="handleHistorySelect(job)"
          >
            <span class="queue-cell cell-type">
              <span class="q-dot" :class="job.status" />
              <span class="q-kind">{{ job.jobType === 'fix' ? 'fix' : 'gen' }}</span>
            </span>
            <span class="queue-cell cell-word q-word">{{ job.word }}</span>
            <span class="queue-cell cell-state q-status">{{ formatCompactStatus(job.status) }}</span>
            <button
              type="button"
              class="queue-cell cell-remove qbtn danger q-close"
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
            type="button"
            class="qbtn primary"
            :disabled="eligibleWorksetJobs.length === 0 || improvingWorkset"
            @click="openImproveSelection"
          >
            Improve All
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

        <div class="bar-list workset-list queue-table queue-table-workset">
          <div v-if="todayWorkset.length > 0" class="queue-table-header">
          <span class="queue-cell cell-type">Type</span>
          <span class="queue-cell cell-word">Word</span>
            <span class="queue-cell cell-score">Score</span>
            <span class="queue-cell cell-fix">Fix</span>
            <span class="queue-cell cell-note">Note</span>
          </div>
          <div
            v-for="job in todayWorkset"
            :key="job.jobId"
            class="bar-row workset-row queue-table-row"
            :class="{ selected: job.jobId === selectedJobId, ['q-' + job.status]: true }"
            @click="handleHistorySelect(job)"
          >
            <span
              class="queue-cell cell-type workset-type-cell"
              :title="`${job.language === 'de' ? 'DE' : 'EN'} · ${formatCompactStatus(job.status)}`"
            >
              <span class="q-dot" :class="job.status" />
              <span class="q-kind">{{ job.jobType === 'fix' ? 'fix' : 'gen' }}</span>
            </span>
            <span class="queue-cell cell-word q-word">{{ job.word }}</span>
            <span class="queue-cell cell-score" title="Effective review score">
              <span class="score-chip" :class="finalScoreClass(job.effectiveReviewScore)">
                {{ formatFinalScore(job.effectiveReviewScore) }}
              </span>
            </span>
            <span class="queue-cell cell-fix" title="Improve count">
              <span
                class="improve-count-chip"
                :class="{ muted: job.improveCount === 0 }"
              >#{{ job.improveCount }}</span>
            </span>
            <span
              v-if="worksetSaveResults.get(job.jobId)"
              class="queue-cell cell-note"
              :title="worksetSaveResults.get(job.jobId)?.message"
            >
              <span class="save-chip" :class="`save-${worksetSaveResults.get(job.jobId)?.status}`">
                {{ worksetSaveResults.get(job.jobId)?.label }}
              </span>
            </span>
            <span
              v-else
              class="queue-cell cell-note"
              :title="job.improveBlockedReason || ''"
            >
              <span
                class="blocked-chip"
                :class="{ empty: !shouldShowBlockedReason(job.improveBlockedReason) }"
              >
                {{ formatBlockedReason(job.improveBlockedReason) }}
              </span>
            </span>
          </div>
          <div v-if="todayWorkset.length === 0" class="bar-empty-list">
            No latest results today
          </div>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="improveSelectionOpen"
      class="pending-improve-overlay"
      role="presentation"
      @click.self="closeImproveSelection"
    >
      <section
        class="pending-improve-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-improve-title"
      >
        <div class="pending-improve-head">
          <div>
            <strong id="pending-improve-title">Pending Improve Selection</strong>
            <p>Review low-score words before creating Improve jobs.</p>
          </div>
          <span>{{ pendingImproveJobs.length }} selected</span>
        </div>
        <div class="pending-improve-list">
          <div v-for="job in pendingImproveJobs" :key="job.jobId" class="pending-improve-row">
            <span class="q-word">{{ job.word }}</span>
            <span
              class="score-chip"
              :class="finalScoreClass(job.effectiveReviewScore)"
            >
              {{ formatFinalScore(job.effectiveReviewScore) }}
            </span>
            <span class="improve-count-chip">#{{ job.improveCount }}</span>
            <button
              type="button"
              class="qbtn"
              :disabled="improvingWorkset"
              @click="removePendingImproveJob(job.jobId)"
            >
              Remove
            </button>
          </div>
          <div v-if="pendingImproveJobs.length === 0" class="bar-empty-list">
            No selected jobs
          </div>
        </div>
        <div class="pending-improve-actions">
          <button
            type="button"
            class="qbtn"
            :disabled="improvingWorkset"
            @click="closeImproveSelection"
          >
            Cancel
          </button>
          <button
            type="button"
            class="qbtn primary"
            :disabled="pendingImproveJobs.length === 0 || improvingWorkset"
            @click="submitWorksetImprove"
          >
            Create Improve Jobs
          </button>
        </div>
      </section>
    </div>
  </Teleport>
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
  overflow-x: auto;
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

.queue-table {
  --queue-gap: 6px;
}

/* ---- Active view: TYPE | WORD | LANG | STATUS | ACTION | REMOVE ---- */
.queue-table-active {
  --queue-columns: 56px minmax(0, 1fr) 36px 48px 36px 28px;
}

.queue-table-active .cell-type,
.queue-table-active .cell-word {
  text-align: left;
}

.queue-table-active .cell-lang,
.queue-table-active .cell-state,
.queue-table-active .cell-action,
.queue-table-active .cell-remove {
  text-align: center;
}

/* ---- History view: TYPE | WORD | STATUS | REMOVE ---- */
.queue-table-history {
  --queue-columns: 56px minmax(0, 1fr) 64px 28px;
}

.queue-table-history .cell-type,
.queue-table-history .cell-word {
  text-align: left;
}

.queue-table-history .cell-state,
.queue-table-history .cell-remove {
  text-align: center;
}

/* ---- Today / Workset view: TYPE | WORD | SCORE | FIX | NOTE ---- */
.queue-table-workset {
  --queue-columns: 76px minmax(0, 1fr) 64px 40px 78px;
}

.queue-table-workset .cell-type,
.queue-table-workset .cell-word {
  text-align: left;
}

.queue-table-workset .cell-score,
.queue-table-workset .cell-fix,
.queue-table-workset .cell-note {
  text-align: center;
}

/* ---- shared grid layout (header and rows use same columns) ---- */
.queue-table-header,
.queue-table-row {
  display: grid;
  grid-template-columns: var(--queue-columns);
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
  gap: 0;
}

/* ---- base cell: no alignment opinion ---- */
.queue-cell {
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- TYPE cell: dot + label inline ---- */
.cell-type {
  display: flex;
  align-items: center;
  gap: 5px;
}

.q-action-placeholder {
  width: 8px;
  height: 8px;
}

.bar-row:hover {
  background: var(--surface);
}

.bar-row.selected {
  background: var(--green-soft, #e8f5e9);
  box-shadow: inset 3px 0 0 var(--green);
}

.bar-row.selected:hover {
  background: var(--green-soft, #e8f5e9);
}

.q-dot {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.q-dot.running { background: var(--blue, #1976d2); }
.q-dot.queued  { background: var(--muted); }
.q-dot.paused  { background: var(--amber); }
.q-dot.error   { background: var(--red); }
.q-dot.complete,
.q-dot.partial  { background: var(--green); }

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

.q-word { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.q-lang { color: var(--muted); font-size: 10px; }
.q-status { font-size: 10px; color: var(--muted); }

.q-running .q-status { color: var(--blue, #1976d2); }
.q-error .q-status { color: var(--red); }
.q-partial .q-status { color: var(--amber); }
.q-complete .q-status { color: var(--green); }

.q-close {
  visibility: hidden;
  width: 22px;
  height: 22px;
  padding: 0;
  display: grid;
  place-items: center;
}

.q-icon-btn {
  width: 22px;
  height: 22px;
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

.pending-improve-overlay {
  position: fixed;
  inset: 0;
  z-index: 2400;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(17 24 39 / 0.28);
}

.pending-improve-panel {
  width: min(560px, calc(100vw - 32px));
  max-height: min(620px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 24px 70px rgb(15 23 42 / 0.22);
  overflow: hidden;
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

.pending-improve-head {
  border-bottom: 1px solid var(--line);
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
  display: flex;
  flex-direction: column;
  min-height: 96px;
  max-height: min(380px, calc(100vh - 220px));
  overflow: auto;
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

.pending-improve-actions {
  border-top: 1px solid var(--line);
  justify-content: flex-end;
}

.workset-list {
  padding-bottom: 8px;
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

.improve-count-chip,
.blocked-chip {
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 10px;
  line-height: 16px;
  color: var(--muted);
  background: var(--surface);
  white-space: nowrap;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* #0 in workset fix column is not actionable — weak visual */
.queue-table-workset .improve-count-chip.muted {
  color: var(--muted);
  border-color: transparent;
  background: transparent;
}

.blocked-chip {
  color: var(--amber);
  border-color: var(--amber-border, var(--line));
  background: var(--amber-soft, var(--surface));
}

.blocked-chip.empty,
.save-chip.empty {
  visibility: hidden;
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
