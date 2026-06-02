<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import {
  AI_STATE_KEY,
  type QueueHistoryJob,
  type QueueHistoryStatus,
  type WorksetJob,
  type WorksetSaveResponse,
} from '@/composables/useAiGenerate';
import { useAppStore } from '@/stores/appStore';
import { useWordStore } from '@/stores/wordStore';
import { useConfirmDialog } from '@/composables/useConfirmDialog';
import {
  describeWorksetSaveResult,
  type WorksetSaveDetail,
} from '@/services/worksetSaveResult';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import PendingImproveDialog from './PendingImproveDialog.vue';
import QueueTable from './QueueTable.vue';
import {
  activeQueueColumns,
  historyQueueColumns,
  worksetQueueColumns,
  type QueueTableRow,
} from './queueTable';

const props = defineProps<{
  expanded: boolean;
}>();

const emit = defineEmits<{
  'expanded-change': [expanded: boolean];
  'job-selected': [jobId: string];
  'history-job-selected': [job: QueueHistoryJob];
}>();

const queueOpen = ref(props.expanded);
watch(
  () => props.expanded,
  next => {
    queueOpen.value = next;
  },
);

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
const {
  dialog: queueConfirmDialog,
  requestConfirm: requestQueueConfirm,
  settleConfirm: settleQueueConfirm,
} = useConfirmDialog();

const appStore = useAppStore();
const wordStore = useWordStore();
const mode = ref<'active' | 'history' | 'workset'>('active');
const historySearch = ref('');
const savingWorkset = ref(false);
const improvingWorkset = ref(false);
const improveSelectionOpen = ref(false);
const pendingImproveJobIds = ref(new Set<string>());
const worksetSaveResults = ref(new Map<string, WorksetSaveDetail>());
const HISTORY_TODAY_DEPENDENCY_NOTICE =
  'Today is built from History. Deleting History jobs can remove items from Today and make them unavailable for Save or Improve.';

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

const activeQueueRows = computed<QueueTableRow[]>(() =>
  queueOverview.value.map(job => ({
    id: job.jobId,
    status: job.status,
    jobType: job.jobType,
    word: job.word,
    language: job.language,
    action:
      job.status === 'running' || job.status === 'queued'
        ? { kind: 'pause', title: 'Pause job' }
        : job.status === 'paused'
          ? { kind: 'resume', title: 'Resume job' }
          : undefined,
    raw: job,
  }))
);

const historyQueueRows = computed<QueueTableRow[]>(() =>
  queueHistory.value.map(job => ({
    id: job.jobId,
    status: job.status,
    jobType: job.jobType,
    word: job.word,
    language: job.language,
    raw: job,
  }))
);

const worksetQueueRows = computed<QueueTableRow[]>(() =>
  todayWorkset.value.map(job => {
    const saveResult = worksetSaveResults.value.get(job.jobId);
    return {
      id: job.jobId,
      status: job.status,
      jobType: job.jobType,
      word: job.word,
      language: job.language,
      score: job.effectiveReviewScore,
      improveCount: job.improveCount,
      note: saveResult
        ? {
            label: saveResult.label,
            title: saveResult.message,
            tone:
              saveResult.status === 'saved'
                ? 'success'
                : saveResult.status === 'conflict'
                  ? 'warning'
                  : saveResult.status === 'missing'
                    ? 'muted'
                    : 'danger',
          }
        : shouldShowBlockedReason(job.improveBlockedReason)
          ? {
              label: formatBlockedReason(job.improveBlockedReason),
              title: job.improveBlockedReason,
              tone: 'warning',
            }
          : undefined,
      raw: job,
    };
  })
);

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
  queueOpen.value = !queueOpen.value;
  emit('expanded-change', queueOpen.value);
  if (queueOpen.value) {
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
  const confirmed = await requestQueueConfirm({
    title: 'Cancel all jobs?',
    message: 'Queued and running Queue jobs will be cancelled.',
    confirmLabel: 'Cancel Jobs',
    variant: 'danger',
  });
  if (!confirmed) return;
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

function handleActiveRowAction(row: QueueTableRow): void {
  if (row.action?.kind === 'pause') {
    void handlePauseJob(row.id);
    return;
  }
  if (row.action?.kind === 'resume') {
    void handleResumeJob(row.id);
  }
}

function handleHistoryRowSelect(row: QueueTableRow): void {
  if (row.raw) handleHistorySelect(row.raw as QueueHistoryJob);
}

function handleWorksetRowSelect(row: QueueTableRow): void {
  if (row.raw) handleHistorySelect(row.raw as QueueHistoryJob);
}

async function handleSaveWorkset(): Promise<void> {
  if (todayWorkset.value.length === 0 || savingWorkset.value) return;
  const confirmed = await requestQueueConfirm({
    title: 'Save Today workset?',
    message: `Save ${todayWorkset.value.length} latest YAML results to the word database?`,
    confirmLabel: 'Save All',
  });
  if (!confirmed) return;

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
  const confirmed = await requestQueueConfirm({
    title: 'Overwrite conflicts?',
    message: `Overwrite ${conflictJobIds.value.length} existing word entries with these generated results?`,
    confirmLabel: 'Overwrite',
    variant: 'danger',
  });
  if (!confirmed) return;

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
  const confirmed = await requestQueueConfirm({
    title: 'Delete history job?',
    message: `${HISTORY_TODAY_DEPENDENCY_NOTICE}\n\nDelete this history job?`,
    confirmLabel: 'Delete',
    variant: 'danger',
  });
  if (!confirmed) return;
  await deleteHistoryJob(jobId);
}

async function handleClearHistory(): Promise<void> {
  const totalLabel = queueHistoryTotal.value || queueHistory.value.length;
  const confirmed = await requestQueueConfirm({
    title: 'Clear history?',
    message: `${HISTORY_TODAY_DEPENDENCY_NOTICE}\n\nDelete ${totalLabel} history jobs?`,
    confirmLabel: 'Clear History',
    variant: 'danger',
  });
  if (!confirmed) return;
  await clearQueueHistory();
}
</script>

<template>
  <div class="queue-bar" :class="{ expanded: queueOpen }" data-tour="ai-generate-queue">
    <ConfirmDialog
      v-bind="queueConfirmDialog"
      @cancel="settleQueueConfirm(false)"
      @confirm="settleQueueConfirm(true)"
    />

    <div class="bar-summary" @click="toggleExpand">
      <span class="bar-label">Queue</span>
      <span v-if="total === 0" class="bar-empty">empty</span>
      <template v-else>
        <span v-if="counts.running" class="ui-chip ui-chip--info bar-count">
          {{ counts.running }}r
        </span>
        <span v-if="counts.queued" class="ui-chip ui-chip--neutral bar-count">
          {{ counts.queued }}q
        </span>
        <span v-if="counts.paused" class="ui-chip ui-chip--warning bar-count">
          {{ counts.paused }}p
        </span>
        <span v-if="counts.error" class="ui-chip ui-chip--danger bar-count">{{ counts.error }}e</span>
        <span v-if="counts.done || !total" class="ui-chip ui-chip--neutral bar-count">
          {{ counts.done }}d
        </span>
      </template>
      <span class="bar-chevron">{{ queueOpen ? '▼' : '▲' }}</span>
    </div>

    <div v-if="queueOpen" class="bar-panel">
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
        <button type="button" class="ui-button ui-button--quiet queue-button" @click="handlePauseAll">
          Pause
        </button>
        <button type="button" class="ui-button ui-button--quiet queue-button" @click="handleResumeAll">
          Resume
        </button>
        <button type="button" class="ui-button ui-button--danger queue-button" @click="handleCancelAll">
          Clear
        </button>
      </div>

      <QueueTable
        v-if="mode === 'active'"
        :columns="activeQueueColumns"
        :rows="activeQueueRows"
        :selected-row-id="selectedJobId"
        empty-text="No active jobs"
        @row-select="row => handleSelect(row.id)"
        @row-action="handleActiveRowAction"
        @row-remove="row => cancelGeneration(row.id)"
      />

      <div v-else-if="mode === 'history'" class="history-panel">
        <p class="ui-notice ui-notice--warning history-dependency-note">
          Today is built from History. Clear History can remove Today items.
        </p>

        <div class="history-tools">
          <form class="history-search" @submit.prevent="applyHistorySearch">
            <input
              v-model="historySearch"
              class="ui-input history-search-input"
              type="search"
              placeholder="Search lemma"
            />
            <button type="submit" class="ui-button ui-button--quiet queue-button">Search</button>
          </form>
          <button
            type="button"
            class="ui-button ui-button--danger queue-button"
            @click="handleClearHistory"
          >
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

        <QueueTable
          :columns="historyQueueColumns"
          :rows="historyQueueRows"
          :selected-row-id="selectedJobId"
          :loading="queueHistoryLoading"
          empty-text="No history jobs"
          @row-select="handleHistoryRowSelect"
          @row-remove="row => handleDeleteHistoryJob(row.id)"
        />

        <div class="history-pager">
          <span>{{ queueHistoryTotal }} jobs</span>
          <div>
            <button
              type="button"
              class="ui-button ui-button--quiet queue-button"
              :disabled="queueHistoryPage <= 1"
              @click="gotoHistoryPage(queueHistoryPage - 1)"
            >
              Prev
            </button>
            <span>{{ queueHistoryPage }} / {{ historyPages }}</span>
            <button
              type="button"
              class="ui-button ui-button--quiet queue-button"
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
            class="ui-button ui-button--quiet queue-button"
            :disabled="todayWorkset.length === 0 || savingWorkset"
            @click="fetchTodayWorkset"
          >
            Refresh
          </button>
          <button
            type="button"
            class="ui-button ui-button--primary queue-button"
            :disabled="todayWorkset.length === 0 || savingWorkset"
            @click="handleSaveWorkset"
          >
            Save All
          </button>
          <button
            type="button"
            class="ui-button ui-button--primary queue-button"
            :disabled="eligibleWorksetJobs.length === 0 || improvingWorkset"
            @click="openImproveSelection"
          >
            Improve All
          </button>
          <button
            v-if="conflictJobIds.length > 0"
            type="button"
            class="ui-button ui-button--danger queue-button"
            :disabled="savingWorkset"
            @click="handleOverwriteConflicts"
          >
            Overwrite Conflicts
          </button>
        </div>

        <div v-if="worksetSaveResults.size > 0" class="workset-result-summary">
          <span v-if="worksetSaveSummary.saved" class="ui-chip ui-chip--success">
            Saved {{ worksetSaveSummary.saved }}
          </span>
          <span v-if="worksetSaveSummary.conflict" class="ui-chip ui-chip--warning">
            Conflict {{ worksetSaveSummary.conflict }}
          </span>
          <span v-if="worksetSaveSummary.invalid" class="ui-chip ui-chip--danger">
            Invalid {{ worksetSaveSummary.invalid }}
          </span>
          <span v-if="worksetSaveSummary.error" class="ui-chip ui-chip--danger">
            Error {{ worksetSaveSummary.error }}
          </span>
          <span v-if="worksetSaveSummary.missing" class="ui-chip ui-chip--neutral">
            Missing {{ worksetSaveSummary.missing }}
          </span>
        </div>

        <QueueTable
          :columns="worksetQueueColumns"
          :rows="worksetQueueRows"
          :selected-row-id="selectedJobId"
          empty-text="No latest results today"
          @row-select="handleWorksetRowSelect"
        />
      </div>
    </div>
  </div>

  <PendingImproveDialog
    :open="improveSelectionOpen"
    :jobs="pendingImproveJobs"
    :improving="improvingWorkset"
    @close="closeImproveSelection"
    @remove="removePendingImproveJob"
    @submit="submitWorksetImprove"
  />
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
  font-size: 11px;
  line-height: 18px;
}

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

.queue-button {
  height: 24px;
  padding: 0 10px;
  border-radius: 3px;
  font-size: 11px;
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
  font-size: 11px;
  min-height: 20px;
  flex-wrap: wrap;
}

.history-tools {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  padding: 6px 14px;
}

.history-dependency-note {
  margin: 0;
  border-width: 0 0 1px;
  border-radius: 0;
  padding: 6px 14px;
  font-size: 11px;
  line-height: 1.35;
}

.history-search {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.history-search-input {
  min-width: 0;
  flex: 1;
  height: 24px;
  border-radius: 3px;
  padding: 0 8px;
  font-size: 11px;
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
