<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue';
import { useAppStore, type LanguageCode } from '@/stores/appStore';
import { useWordStore } from '@/stores/wordStore';
import { AI_STATE_KEY, type ResumeStage, type StepState } from '@/composables/useAiGenerate';
import { useConfirmDialog } from '@/composables/useConfirmDialog';
import AiGenerateStagePanel from './AiGenerateStagePanel.vue';
import BatchGeneratePanel from './BatchGeneratePanel.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import GenerateProgressPanel from './GenerateProgressPanel.vue';
import SingleGenerateForm from './SingleGenerateForm.vue';
import type { BatchGenerateDraftItem } from '@/services/batchGenerateParser';
import { buildDisplaySteps, resolveStageDetailsStep } from './stageDisplay';
import request from '@/utils/request';
import { useOverlayStack } from '@/composables/useOverlayStack';

const props = defineProps<{
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
const fixing = ref(false);
const saving = ref(false);
const notes = ref('');
const batchSubmitting = ref(false);
const errorMessage = ref('');
const selectedStageKey = ref<string | null>(null);
const stagePanelOpen = ref(false);
const language = computed<LanguageCode>(() => appStore.currentLanguage);
const overlayStack = useOverlayStack('ai-generate');

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

watch(
  () => props.open,
  open => {
    if (open) overlayStack.bringToFront();
    else overlayStack.remove();
  },
  { immediate: true }
);

onUnmounted(() => overlayStack.remove());

const reviewScore = computed(() => {
  const userScore = currentJob.value?.scores?.user_review_score;
  if (typeof userScore === 'number') return userScore;
  const aiScore = currentJob.value?.scores?.overall_score;
  return typeof aiScore === 'number' ? aiScore : null;
});
const isRevisionNotesMode = computed(() => isComplete.value || hasRevisionNotes.value);

async function handleFix(): Promise<void> {
  const jobId = currentJob.value?.jobId;
  if (!jobId) return;
  fixing.value = true;
  try {
    await fixGeneration(jobId, notes.value.trim() || undefined);
    notes.value = '';
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Fix failed';
  } finally {
    fixing.value = false;
  }
}

async function handleStart(payload: { word: string; context?: string; notes?: string }): Promise<void> {
  errorMessage.value = '';
  if (!payload.word.trim()) {
    errorMessage.value = '请输入单词';
    return;
  }
  try {
    await startGeneration({
      word: payload.word.trim(),
      context: payload.context,
      language: language.value,
      notes: payload.notes,
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
  <aside
    v-show="open"
    class="ai-drawer"
    aria-label="AI Generate Drawer"
    :style="{ zIndex: overlayStack.zIndex.value }"
    @pointerdown="overlayStack.bringToFront"
  >
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

    <div class="drawer-body">
      <SingleGenerateForm
        v-if="entryMode === 'single'"
        :running="isRunning"
        :queued-position="currentJob?.status === 'queued' ? currentJob.queuePosition || 1 : undefined"
        :revision-mode="isRevisionNotesMode"
        :notes="notes"
        @submit="handleStart"
        @cancel="handleCancel"
        @update-notes="notes = $event"
      />

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

      <GenerateProgressPanel
        v-if="currentJob"
        :job="currentJob"
        :steps="displaySteps"
        :running="isRunning"
        @details="handleStageClick"
        @regenerate="handleStageRegenerate"
      />

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
.resume-section > span,
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin: 10px 14px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
  flex: 0 0 auto;
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

.result-actions,
.resume-buttons,
.score-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.score-line {
  justify-content: space-between;
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

.secondary-button,
.primary-button {
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

.secondary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  margin: 0;
  color: var(--red);
  font-size: 12px;
}

.result-section,
.resume-section {
  display: grid;
  gap: 10px;
}

.resume-buttons {
  flex-wrap: wrap;
}

</style>
