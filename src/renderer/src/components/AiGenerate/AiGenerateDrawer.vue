<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useAppStore, type LanguageCode } from '@/stores/appStore';
import { useWordStore } from '@/stores/wordStore';
import { AI_STATE_KEY, type ResumeStage, type StepState } from '@/composables/useAiGenerate';
import { useConfirmDialog } from '@/composables/useConfirmDialog';
import AiGenerateStagePanel from './AiGenerateStagePanel.vue';
import BatchGeneratePanel from './BatchGeneratePanel.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import type { BatchGenerateDraftItem } from '@/services/batchGenerateParser';
import { buildDisplaySteps, resolveStageDetailsStep } from './stageDisplay';
import request from '@/utils/request';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'yaml-ready': [yaml: string];
}>();

const appStore = useAppStore();
const wordStore = useWordStore();
const {
  dialog: saveConfirmDialog,
  requestConfirm: requestSaveConfirm,
  settleConfirm: settleSaveConfirm,
} = useConfirmDialog();
const {
  currentJob,
  isRunning,
  isComplete,
  startGeneration,
  startBatchGeneration,
  cancelGeneration,
  resumeGeneration,
  fixGeneration,
  setUserReviewScore,
} = inject(AI_STATE_KEY)!;

type EntryMode = 'single' | 'batch';
interface FormatValidationResponse {
  valid: boolean;
  errors: string[];
  yaml?: string;
  changed?: boolean;
  diagnostics?: Array<{ message: string; path?: string }>;
}

const entryMode = ref<EntryMode>('single');
const word = ref('');
const fixing = ref(false);
const saving = ref(false);
const context = ref('');
const notes = ref('');
const batchSubmitting = ref(false);
const errorMessage = ref('');
const selectedStageKey = ref<string | null>(null);
const stagePanelOpen = ref(false);
const language = computed<LanguageCode>(() => appStore.currentLanguage);

const hasRevisionNotes = computed(() => {
  const notes = currentJob.value?.scores?.revision_notes as string | undefined;
  return typeof notes === 'string' && notes.length > 0 && notes !== '无需修改。';
});

const displaySteps = computed(() => {
  return buildDisplaySteps(currentJob.value?.steps || [], hasRevisionNotes.value);
});

const selectedStage = computed(() => {
  return resolveStageDetailsStep(displaySteps.value, selectedStageKey.value);
});

watch(selectedStage, step => {
  if (stagePanelOpen.value && selectedStageKey.value && !step) {
    stagePanelOpen.value = false;
  }
});

const progressPercent = computed(() => {
  const job = currentJob.value;
  if (!job) return 0;
  const steps = displaySteps.value;
  const complete = steps.filter(step => step.status === 'complete').length;
  const total = steps.length || 3;
  return Math.min(100, Math.round((complete / total) * 100));
});

const reviewScore = computed(() => {
  const userScore = currentJob.value?.scores?.user_review_score;
  if (typeof userScore === 'number') return userScore;
  const aiScore = currentJob.value?.scores?.overall_score;
  return typeof aiScore === 'number' ? aiScore : null;
});
const canStart = computed(() => word.value.trim().length > 0);
const isRevisionNotesMode = computed(() => isComplete.value || hasRevisionNotes.value);
const notesLabel = computed(() => (isRevisionNotesMode.value ? 'Revision notes' : 'Generation notes'));
const notesBadge = computed(() => (isRevisionNotesMode.value ? 'Regenerate / Improve Text' : 'Generate'));
const notesPlaceholder = computed(() =>
  isRevisionNotesMode.value
    ? 'Add extra feedback for the next revision...'
    : 'Optional hints, constraints, or examples...'
);
const notesHelp = computed(() =>
  isRevisionNotesMode.value
    ? 'Applied to stage regeneration and text quality improvement for the selected job.'
    : 'Applied when starting a new single generation.'
);

async function handleFix(): Promise<void> {
  const jobId = currentJob.value?.jobId;
  if (!jobId) return;
  fixing.value = true;
  try {
    await fixGeneration(jobId, notes.value.trim() || undefined);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Fix failed';
  } finally {
    fixing.value = false;
  }
}

async function handleStart(): Promise<void> {
  errorMessage.value = '';
  const normalized = word.value.trim();
  if (!normalized) {
    errorMessage.value = '请输入单词';
    return;
  }
  try {
    await startGeneration({
      word: normalized,
      context: context.value.trim() || undefined,
      language: language.value,
      notes: notes.value.trim() || undefined,
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '生成请求失败';
  }
}

async function handleBatchStart(items: BatchGenerateDraftItem[]): Promise<void> {
  errorMessage.value = '';
  if (items.length === 0) {
    errorMessage.value = '请输入至少一个单词';
    return;
  }
  batchSubmitting.value = true;
  try {
    const response = await startBatchGeneration(language.value, items);
    const skipped = response.skipped.length ? `, skipped ${response.skipped.length}` : '';
    errorMessage.value = `Created ${response.jobs.length} jobs${skipped}.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '批量提交失败';
  } finally {
    batchSubmitting.value = false;
  }
}

async function handleCancel(): Promise<void> {
  const jobId = currentJob.value?.jobId;
  if (!jobId) return;
  await cancelGeneration(jobId);
}

async function handleResume(fromStage?: ResumeStage): Promise<void> {
  const jobId = currentJob.value?.jobId;
  if (!jobId) return;
  try {
    await resumeGeneration(
      jobId,
      fromStage,
      notes.value.trim() || undefined,
      reviewScore.value ?? undefined
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '重试失败';
  }
}

function formatDiagnosticSummary(res: FormatValidationResponse): string {
  const diagnostics = res.diagnostics || [];
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    return `${first.path ? `${first.path}: ` : ''}${first.message}`;
  }
  return res.errors?.[0] || 'YAML format check failed';
}

async function confirmFillPartialRepair(result: FormatValidationResponse): Promise<boolean> {
  const summary = formatDiagnosticSummary(result);
  const repairState = result.changed
    ? 'Basic Format Fix made partial repairs, but the YAML is not saveable yet.'
    : 'Basic Format Fix could not safely repair this YAML automatically.';
  return requestSaveConfirm({
    title: 'Format still needs manual repair',
    message: `${repairState}\n\n${summary}\n\nFill the YAML into the Editor so you can finish the fix manually?`,
    confirmLabel: 'Fill Editor',
    cancelLabel: 'Keep Reviewing',
  });
}

async function fillEditor(): Promise<void> {
  const job = currentJob.value;
  if (!job) {
    errorMessage.value = 'No active job';
    return;
  }
  const yaml = job.yaml;
  if (yaml) {
    try {
      const result = await request.post<FormatValidationResponse>('/v2/words/validate', { yaml });
      if (result.yaml && result.valid) {
        emit('yaml-ready', result.yaml);
        if (result.changed) {
          appStore.addToast('Format repaired before filling editor.', 'success');
        }
        return;
      }

      if (result.yaml) {
        errorMessage.value = formatDiagnosticSummary(result);
        const shouldFill = await confirmFillPartialRepair(result);
        if (shouldFill) {
          emit('yaml-ready', result.yaml);
          appStore.addToast('YAML filled into editor for manual repair.', 'warning');
        }
        return;
      }

      errorMessage.value = formatDiagnosticSummary(result);
      appStore.addToast(errorMessage.value, 'error', 5000);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to prepare YAML';
      appStore.addToast(errorMessage.value, 'error', 5000);
    }
  } else {
    errorMessage.value = 'No YAML to fill. The generation may have failed — check stage outputs.';
  }
}

async function saveGeneratedYaml(): Promise<void> {
  const job = currentJob.value;
  if (!job?.yaml) {
    errorMessage.value = 'No YAML to save. Use Fill Editor to repair manually or regenerate.';
    appStore.addToast(errorMessage.value, 'error');
    return;
  }

  saving.value = true;
  errorMessage.value = '';
  try {
    const result = await wordStore.saveWord(job.yaml, false);
    if (result === true) return;

    if (result && typeof result === 'object' && result.status === 'conflict') {
      const lemma = typeof result.lemma === 'string' ? result.lemma : job.word;
      const shouldOverwrite = await requestSaveConfirm({
        title: 'Overwrite existing word?',
        message: `A saved entry for "${lemma}" already exists. Overwrite it with this generated result?`,
        confirmLabel: 'Overwrite',
        variant: 'danger',
      });
      if (!shouldOverwrite) {
        appStore.addToast('Save cancelled. Existing word was not changed.', 'info');
        return;
      }
      const overwriteResult = await wordStore.saveWord(job.yaml, true);
      if (overwriteResult !== true) {
        errorMessage.value = 'Overwrite failed. Use Fill Editor to repair manually or regenerate.';
      }
      return;
    }

    errorMessage.value = 'Save failed. Use Fill Editor to repair manually or regenerate.';
  } finally {
    saving.value = false;
  }
}

async function handleScoreChange(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement;
  const value = parseInt(target.value, 10);
  const job = currentJob.value;
  if (!job?.scores || !job.jobId || isNaN(value)) return;

  const normalizedScore = Math.max(0, Math.min(10, value));
  try {
    await setUserReviewScore(job.jobId, normalizedScore);
    (job.scores as Record<string, unknown>).user_review_score = normalizedScore;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Failed to save user review score';
  }
}

function handleStageClick(step: StepState): void {
  if (step.step === 'fixing' && step.status === 'pending') {
    handleFix();
    return;
  }
  selectedStageKey.value = step.step;
  stagePanelOpen.value = true;
}

async function handleStageRegenerate(step: StepState): Promise<void> {
  if (step.step === 'fixing') {
    await handleFix();
    return;
  }
  await handleResume(step.step as ResumeStage);
}
</script>

<template>
  <aside v-show="open" class="ai-drawer" aria-label="AI Generate Drawer">
    <ConfirmDialog
      v-bind="saveConfirmDialog"
      @cancel="settleSaveConfirm(false)"
      @confirm="settleSaveConfirm(true)"
    />
    <AiGenerateStagePanel
      :open="stagePanelOpen"
      :step="selectedStage"
      @close="stagePanelOpen = false"
    />

    <header class="drawer-head">
      <div>
        <span>AI Generate</span>
        <strong>{{ language === 'de' ? 'German pipeline' : 'English pipeline' }}</strong>
      </div>
      <button type="button" class="icon-button" aria-label="Close AI Generate" @click="emit('close')">
        ×
      </button>
    </header>

    <div class="drawer-body">
      <section class="mode-tabs" aria-label="AI Generate mode" data-tour="ai-generate-mode">
        <button
          type="button"
          :class="{ active: entryMode === 'single' }"
          @click="entryMode = 'single'"
        >
          Single
        </button>
        <button type="button" :class="{ active: entryMode === 'batch' }" @click="entryMode = 'batch'">
          Batch
        </button>
      </section>

      <template v-if="entryMode === 'single'">
        <section class="input-grid">
          <label>
            <span>Word</span>
            <input
              v-model="word"
              type="text"
              placeholder="Enter the word to analyze"
              @keyup.enter="handleStart"
            />
          </label>
          <label>
            <span>Context</span>
            <input
              v-model="context"
              type="text"
              placeholder="Add the word's sentence or context"
            />
          </label>
          <label class="notes-field" :class="{ 'is-revision': isRevisionNotesMode }">
            <span class="field-label-row">
              <span>{{ notesLabel }}</span>
              <span class="field-badge">{{ notesBadge }}</span>
            </span>
            <textarea
              v-model="notes"
              class="notes-input"
              rows="2"
              :placeholder="notesPlaceholder"
            />
            <small class="field-help">{{ notesHelp }}</small>
          </label>
        </section>

        <div class="action-row" data-tour="ai-generate-submit">
          <button type="button" class="primary-button" :disabled="!canStart" @click="handleStart">
            Generate
          </button>
          <button v-if="isRunning" type="button" class="danger-button" @click="handleCancel">
            Cancel selected
          </button>
          <span v-if="currentJob?.status === 'queued'" class="queue-pill">
            Queued {{ currentJob.queuePosition || 1 }}
          </span>
        </div>
      </template>

      <BatchGeneratePanel
        v-else
        :submitting="batchSubmitting"
        :running="isRunning"
        @submit="handleBatchStart"
        @cancel="handleCancel"
      />

      <p v-if="errorMessage || currentJob?.error" class="error-text">
        {{ errorMessage || currentJob?.error }}
      </p>

      <section v-if="currentJob" class="progress-section" data-tour="ai-generate-progress">
        <div class="progress-head">
          <div class="job-title">
            <strong>{{ currentJob.word }}</strong>
            <span>{{ currentJob.language === 'de' ? 'German' : 'English' }}</span>
          </div>
          <span :class="`status-chip chip-${currentJob.status}`">{{ currentJob.status }}</span>
          <strong>{{ progressPercent }}%</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>

        <div class="stage-list">
          <div
            v-for="step in displaySteps"
            :key="step.step"
            class="stage-row"
            :class="`stage-${step.status}`"
          >
            <span class="stage-name">{{ step.step }}</span>
            <span class="stage-meta">
              {{ step.duration ? `${Math.round(step.duration / 100) / 10}s` : step.status }}
            </span>
            <div class="stage-actions">
              <button
                v-if="step.status === 'complete' || step.status === 'error'"
                type="button"
                class="stage-action-btn regenerate"
                :disabled="isRunning"
                @click="handleStageRegenerate(step)"
              >
                Regenerate from
              </button>
              <button
                type="button"
                class="stage-action-btn"
                @click="handleStageClick(step)"
              >
                Details
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="isComplete" class="result-section">
        <div class="score-line" data-tour="ai-generate-score">
          <span>Review score</span>
          <input
            type="number"
            min="0"
            max="10"
            :value="reviewScore"
            class="score-input"
            @change="handleScoreChange"
          />
        </div>
        <div class="result-actions">
          <button
            type="button"
            class="secondary-button fix-button"
            data-tour="ai-generate-improve"
            :disabled="fixing"
            @click="handleFix"
          >
            {{ fixing ? 'Improving...' : 'Improve Text' }}
          </button>
          <button
            type="button"
            class="secondary-button save-button"
            data-tour="ai-generate-save"
            :disabled="saving"
            @click="saveGeneratedYaml"
          >
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
          <button
            type="button"
            class="primary-button"
            data-tour="ai-generate-fill-editor"
            @click="fillEditor"
          >
            Fill Editor
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.ai-drawer {
  position: absolute;
  inset: 0;
  width: 100%;
  z-index: 20;
  background: var(--surface-panel);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
}

.drawer-head {
  height: 64px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-head);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.drawer-head span,
.input-grid span,
.resume-section > span,
.progress-head,
.score-line span {
  color: var(--muted);
  font-size: 12px;
}

.drawer-head strong {
  display: block;
  margin-top: 2px;
  color: var(--text);
  font-size: 15px;
}

.icon-button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: grid;
  align-content: start;
  gap: 14px;
}

.mode-tabs {
  position: sticky;
  top: 0;
  z-index: 12;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
  box-shadow: 0 4px 8px color-mix(in srgb, var(--surface-panel) 72%, transparent);
}

.mode-tabs > button {
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}

.mode-tabs > button.active {
  background: var(--green-soft);
  color: var(--green);
}

.input-grid {
  display: grid;
  gap: 10px;
}

.input-grid label {
  display: grid;
  gap: 5px;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-badge {
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--muted);
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.notes-field.is-revision .field-badge {
  border-color: var(--green-border);
  background: var(--green-soft);
  color: var(--green);
}

.input-grid input,
.input-grid textarea {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  color: var(--text);
  padding: 0 10px;
  font-size: 13px;
  outline: 0;
}

.input-grid textarea {
  min-height: 58px;
  height: auto;
  resize: vertical;
  line-height: 1.45;
  padding-top: 8px;
  padding-bottom: 8px;
}

.input-grid input:focus,
.input-grid textarea:focus {
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
}

.field-help {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.action-row,
.result-actions,
.resume-buttons,
.progress-head,
.score-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-head,
.score-line {
  justify-content: space-between;
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

.score-input {
  width: 52px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  color: var(--text);
  text-align: center;
  font-weight: 650;
  font-size: 13px;
  outline: 0;
}

.score-input:focus {
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
}

.primary-button,
.secondary-button,
.danger-button {
  height: 32px;
  border-radius: var(--radius-sm);
  padding: 0 12px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.primary-button {
  background: var(--green);
  color: #fff;
}

.primary-button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.secondary-button {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text-soft);
}

.danger-button {
  background: var(--red-soft);
  border-color: var(--red-border);
  color: var(--red);
}

.secondary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.queue-pill {
  border: 1px solid var(--amber);
  border-radius: var(--radius-full);
  padding: 4px 8px;
  color: var(--amber);
  font-size: 12px;
}

.error-text {
  margin: 0;
  color: var(--red);
  font-size: 12px;
}

.progress-section,
.result-section,
.resume-section {
  display: grid;
  gap: 10px;
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

.resume-buttons {
  flex-wrap: wrap;
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
