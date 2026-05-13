<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useAppStore, type LanguageCode } from '@/stores/appStore';
import { AI_STATE_KEY, type ResumeStage, type StepState } from '@/composables/useAiGenerate';
import AiGenerateStagePanel from './AiGenerateStagePanel.vue';
import { parseBatchJson, parseBatchText } from '@/services/batchGenerateParser';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'yaml-ready': [yaml: string];
}>();

const appStore = useAppStore();
const {
  currentJob,
  isRunning,
  isComplete,
  startGeneration,
  startBatchGeneration,
  cancelGeneration,
  resumeGeneration,
  fixGeneration,
} = inject(AI_STATE_KEY)!;

type EntryMode = 'single' | 'batch';
type BatchSource = 'text' | 'json';

const entryMode = ref<EntryMode>('single');
const batchSource = ref<BatchSource>('text');
const word = ref('');
const fixing = ref(false);
const context = ref('');
const notes = ref('');
const batchText = ref('');
const batchFileName = ref('');
const batchSubmitting = ref(false);
const errorMessage = ref('');
const selectedStage = ref<StepState | null>(null);
const stagePanelOpen = ref(false);
const language = computed<LanguageCode>(() => appStore.currentLanguage);

const stageOrder = ['searching', 'pondering', 'auditing'];

const displaySteps = computed(() => {
  const steps = [...(currentJob.value?.steps || [])];
  if (hasRevisionNotes.value && !steps.some(s => s.step === 'fixing')) {
    steps.push({ step: 'fixing', status: 'pending' as const });
  }
  return steps;
});

const progressPercent = computed(() => {
  const job = currentJob.value;
  if (!job) return 0;
  const complete = job.steps.filter(step => step.status === 'complete').length;
  const total = stageOrder.length + (hasRevisionNotes.value ? 1 : 0);
  return Math.min(100, Math.round((complete / total) * 100));
});

const reviewScore = computed(() => {
  const score = currentJob.value?.scores?.overall_score;
  return typeof score === 'number' ? score : null;
});
const canStart = computed(() => word.value.trim().length > 0);
const batchParseResult = computed(() =>
  batchSource.value === 'json' ? parseBatchJson(batchText.value) : parseBatchText(batchText.value)
);
const batchItems = computed(() => batchParseResult.value.items);
const canStartBatch = computed(
  () => batchItems.value.length > 0 && batchParseResult.value.invalid.length === 0
);
const batchPlaceholder = computed(() =>
  batchSource.value === 'json'
    ? '{ "items": [{ "word": "proliferate", "context": "..." }] }'
    : 'proliferate\ncontext: The idea began to proliferate.\nnotes: Latin root\n\nameliorate'
);
const missingContextCount = computed(
  () => batchItems.value.filter(item => !item.context?.trim()).length
);
const missingNotesCount = computed(() => batchItems.value.filter(item => !item.notes?.trim()).length);

const hasRevisionNotes = computed(() => {
  const notes = currentJob.value?.scores?.revision_notes as string | undefined;
  return typeof notes === 'string' && notes.length > 0 && notes !== '无需修改。';
});

const isRevisionNotesMode = computed(() => isComplete.value || hasRevisionNotes.value);
const notesLabel = computed(() => (isRevisionNotesMode.value ? 'Revision notes' : 'Generation notes'));
const notesBadge = computed(() => (isRevisionNotesMode.value ? 'Regenerate / Auto Fix' : 'Generate'));
const notesPlaceholder = computed(() =>
  isRevisionNotesMode.value
    ? 'Add extra feedback for the next revision...'
    : 'Optional hints, constraints, or examples...'
);
const notesHelp = computed(() =>
  isRevisionNotesMode.value
    ? 'Applied to Regenerate and Auto Fix for the selected job.'
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

async function handleBatchStart(): Promise<void> {
  errorMessage.value = '';
  if (!canStartBatch.value) {
    errorMessage.value = batchParseResult.value.invalid[0] || '请输入至少一个单词';
    return;
  }
  batchSubmitting.value = true;
  try {
    const response = await startBatchGeneration(language.value, batchItems.value);
    const skipped = response.skipped.length ? `, skipped ${response.skipped.length}` : '';
    errorMessage.value = `Created ${response.jobs.length} jobs${skipped}.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '批量提交失败';
  } finally {
    batchSubmitting.value = false;
  }
}

async function handleBatchFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  batchFileName.value = file.name;
  batchSource.value = 'json';
  batchText.value = await file.text();
  target.value = '';
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

function fillEditor(): void {
  const job = currentJob.value;
  if (!job) {
    errorMessage.value = 'No active job';
    return;
  }
  const yaml = job.yaml;
  if (yaml) {
    emit('yaml-ready', yaml);
  } else {
    errorMessage.value = 'No YAML to fill. The generation may have failed — check stage outputs.';
  }
}

function handleScoreChange(e: Event): void {
  const target = e.target as HTMLInputElement;
  const value = parseInt(target.value, 10);
  if (currentJob.value?.scores && !isNaN(value)) {
    (currentJob.value.scores as Record<string, unknown>).overall_score = Math.max(
      0,
      Math.min(10, value)
    );
  }
}

function handleStageClick(step: StepState): void {
  if (step.step === 'fixing' && step.status === 'pending') {
    handleFix();
    return;
  }
  selectedStage.value = step;
  stagePanelOpen.value = true;
}

async function handleStageRegenerate(step: StepState): Promise<void> {
  await handleResume(step.step as ResumeStage);
}
</script>

<template>
  <aside v-show="open" class="ai-drawer" aria-label="AI Generate Drawer">
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
      <section class="mode-tabs" aria-label="AI Generate mode">
        <button
          type="button"
          :class="{ active: entryMode === 'single' }"
          @click="entryMode = 'single'"
        >
          Single
        </button>
        <div class="batch-mode" :class="{ active: entryMode === 'batch' }">
          <button type="button" class="batch-mode-main" @click="entryMode = 'batch'">
            Batch
          </button>
          <select
            v-model="batchSource"
            class="batch-source-select"
            aria-label="Batch source"
            @click.stop="entryMode = 'batch'"
            @change="entryMode = 'batch'"
          >
            <option value="text">Text</option>
            <option value="json">JSON file</option>
          </select>
          <button type="button" class="batch-info-button" aria-label="Batch input help">
            i
            <span class="batch-help">
              Text: one word per line, or blank-line blocks with word/context/notes. JSON:
              items array with word, context, and notes fields. Only word is required.
            </span>
          </button>
        </div>
      </section>

      <template v-if="entryMode === 'single'">
        <section class="input-grid">
          <label>
            <span>Word</span>
            <input v-model="word" type="text" @keyup.enter="handleStart" />
          </label>
          <label>
            <span>Context</span>
            <input v-model="context" type="text" />
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

        <div class="action-row">
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

      <section v-else class="batch-panel">
        <div v-if="batchSource === 'json'" class="batch-toolbar">
          <span>Import the browser-extension JSON contract.</span>
          <label class="file-button">
            Import JSON
            <input type="file" accept="application/json,.json" @change="handleBatchFileChange" />
          </label>
        </div>

        <textarea
          v-model="batchText"
          class="batch-textarea"
          :placeholder="batchPlaceholder"
        />

        <div class="batch-summary">
          <span>{{ batchItems.length }} words</span>
          <span>{{ missingContextCount }} without context</span>
          <span>{{ missingNotesCount }} without notes</span>
          <span v-if="batchFileName">{{ batchFileName }}</span>
        </div>
        <p v-if="batchParseResult.invalid.length" class="error-text">
          {{ batchParseResult.invalid[0] }}
        </p>
        <div v-if="batchItems.length" class="batch-preview">
          <div v-for="item in batchItems.slice(0, 5)" :key="item.word" class="batch-preview-row">
            <strong>{{ item.word }}</strong>
            <span>{{ item.context || 'No context' }}</span>
          </div>
        </div>
        <div class="action-row">
          <button
            type="button"
            class="primary-button"
            :disabled="!canStartBatch || batchSubmitting"
            @click="handleBatchStart"
          >
            {{ batchSubmitting ? 'Creating...' : 'Create Batch' }}
          </button>
          <button v-if="isRunning" type="button" class="danger-button" @click="handleCancel">
            Cancel selected
          </button>
        </div>
      </section>

      <p v-if="errorMessage || currentJob?.error" class="error-text">
        {{ errorMessage || currentJob?.error }}
      </p>

      <section v-if="currentJob" class="progress-section">
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
                Regenerate
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
        <div class="score-line">
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
          <button type="button" class="secondary-button" @click="handleResume('pondering')">
            Regenerate
          </button>
          <button
            v-if="hasRevisionNotes"
            type="button"
            class="secondary-button fix-button"
            :disabled="fixing"
            @click="handleFix"
          >
            {{ fixing ? 'Fixing...' : 'Auto Fix' }}
          </button>
          <button type="button" class="primary-button" @click="fillEditor">Fill Editor</button>
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}

.mode-tabs > button,
.batch-mode-main {
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.mode-tabs > button.active,
.batch-mode.active {
  background: var(--green-soft);
  color: var(--green);
}

.batch-mode {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(56px, 1fr) auto auto;
  align-items: center;
  color: var(--muted);
}

.batch-mode-main {
  min-width: 0;
  color: inherit;
}

.batch-source-select {
  height: 24px;
  max-width: 86px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--text-soft);
  padding: 0 22px 0 8px;
  font-size: 11px;
  font-weight: 650;
  outline: 0;
}

.batch-mode.active .batch-source-select {
  border-color: var(--green-border);
  color: var(--green);
}

.batch-info-button {
  position: relative;
  width: 22px;
  height: 22px;
  margin-right: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface-panel);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  cursor: help;
}

.batch-help {
  position: absolute;
  right: 0;
  top: 28px;
  width: 260px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--text-soft);
  box-shadow: var(--shadow-md);
  padding: 10px;
  font-size: 11px;
  line-height: 1.5;
  text-align: left;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
  z-index: 30;
}

.batch-info-button:hover .batch-help,
.batch-info-button:focus-visible .batch-help {
  opacity: 1;
  transform: translateY(0);
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

.batch-panel {
  display: grid;
  gap: 10px;
}

.batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}

.file-button {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.file-button input {
  display: none;
}

.batch-textarea {
  min-height: 168px;
  max-height: 260px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  color: var(--text);
  padding: 10px;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.55;
  outline: 0;
}

.batch-textarea:focus {
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
}

.batch-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.batch-summary span {
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--muted);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 650;
}

.batch-preview {
  display: grid;
  gap: 6px;
}

.batch-preview-row {
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  display: grid;
  grid-template-columns: minmax(92px, 0.38fr) 1fr;
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
}

.batch-preview-row strong {
  min-width: 0;
  color: var(--text);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-preview-row span {
  min-width: 0;
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
