<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useAppStore, type LanguageCode } from '@/stores/appStore';
import { AI_STATE_KEY, type ResumeStage, type StepState } from '@/composables/useAiGenerate';
import AiGenerateStagePanel from './AiGenerateStagePanel.vue';

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
  cancelGeneration,
  resumeGeneration,
  fixGeneration,
} = inject(AI_STATE_KEY)!;

const word = ref('');
const fixing = ref(false);
const context = ref('');
const notes = ref('');
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

const stageOptions = computed(() =>
  currentJob.value?.steps.filter(step => step.status === 'complete' || step.status === 'error') ||
  []
);

const hasRevisionNotes = computed(() => {
  const notes = currentJob.value?.scores?.revision_notes as string | undefined;
  return typeof notes === 'string' && notes.length > 0 && notes !== '无需修改。';
});

async function handleFix(): Promise<void> {
  const jobId = currentJob.value?.jobId;
  if (!jobId) return;
  fixing.value = true;
  try {
    await fixGeneration(jobId);
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
      <section class="input-grid">
        <label>
          <span>Word</span>
          <input v-model="word" type="text" @keyup.enter="handleStart" />
        </label>
        <label>
          <span>Context</span>
          <input v-model="context" type="text" />
        </label>
        <label>
          <span>Notes</span>
          <input v-model="notes" type="text" />
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
          <button
            v-for="step in displaySteps"
            :key="step.step"
            type="button"
            class="stage-row"
            :class="`stage-${step.status}`"
            @click="handleStageClick(step)"
          >
            <span class="stage-name">{{ step.step }}</span>
            <span class="stage-meta">
              {{ step.duration ? `${Math.round(step.duration / 100) / 10}s` : step.status }}
            </span>
          </button>
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

      <section v-if="stageOptions.length" class="resume-section">
        <span>Regenerate from</span>
        <div class="resume-buttons">
          <button
            v-for="step in stageOptions"
            :key="step.step"
            type="button"
            class="secondary-button"
            :disabled="isRunning"
            @click="handleResume(step.step as ResumeStage)"
          >
            {{ step.step }}
          </button>
        </div>
      </section>
</div>
  </aside>
</template>

<style scoped>
.ai-drawer {
  position: fixed;
  top: 88px;
  right: 0;
  bottom: 0;
  width: min(520px, 100vw);
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

.input-grid {
  display: grid;
  gap: 10px;
}

.input-grid label {
  display: grid;
  gap: 5px;
}

.input-grid input {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  color: var(--text);
  padding: 0 10px;
  font-size: 13px;
  outline: 0;
}

.input-grid input:focus {
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
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
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}

.stage-name {
  font-size: 13px;
  font-weight: 650;
  text-transform: capitalize;
}

.stage-meta {
  color: var(--muted);
  font-size: 12px;
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
