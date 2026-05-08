<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppStore, type LanguageCode } from '@/stores/appStore';
import { useAiGenerate } from '@/composables/useAiGenerate';

const emit = defineEmits<{
  'yaml-ready': [yaml: string];
}>();

const appStore = useAppStore();
const { currentJob, isRunning, isComplete, startGeneration, cancelGeneration, resumeGeneration } =
  useAiGenerate();

const expanded = ref(false);
const word = ref('');
const context = ref('');
const notes = ref('');
const errorMessage = ref('');
const language = computed<LanguageCode>(() => appStore.currentLanguage);

const progressPercent = computed(() => {
  const job = currentJob.value;
  if (!job) return 0;
  const total = 3;
  const complete = job.steps.filter(step => step.status === 'complete').length;
  return Math.min(100, Math.round((complete / total) * 100));
});

const currentStageLabel = computed(() => {
  const job = currentJob.value;
  if (!job) return 'Ready';
  if (job.status === 'complete') return 'Review complete';
  if (job.status === 'error') return 'Generation failed';
  const running = job.steps.find(step => step.status === 'running');
  return running?.message || running?.step || 'Starting';
});

const runningStepTokens = computed(() => {
  const job = currentJob.value;
  if (!job) return '';
  const running = job.steps.find(step => step.status === 'running');
  if (running?.tokens) return running.tokens.slice(-800);
  const last = [...job.steps].reverse().find(step => step.tokens);
  return last?.tokens?.slice(-800) || '';
});

const reviewScore = computed(() => {
  const score = currentJob.value?.scores?.overall_score;
  return typeof score === 'number' ? score : null;
});

async function handleStart(): Promise<void> {
  errorMessage.value = '';
  const normalized = word.value.trim();
  if (!normalized) {
    errorMessage.value = '请输入单词';
    return;
  }
  expanded.value = true;
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

function handleAcceptYaml(): void {
  const yaml = currentJob.value?.yaml;
  if (yaml) emit('yaml-ready', yaml);
}

async function handleCancel(): Promise<void> {
  const jobId = currentJob.value?.jobId;
  if (!jobId) return;
  await cancelGeneration(jobId);
}

async function handleResume(): Promise<void> {
  const jobId = currentJob.value?.jobId;
  if (!jobId) return;
  try {
    await resumeGeneration(jobId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '重试失败';
  }
}

async function handleRegenerate(): Promise<void> {
  await handleStart();
}
</script>

<template>
  <section class="ai-generate" :class="{ 'is-expanded': expanded }">
    <div class="ai-main">
      <button class="icon-toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        <span>{{ expanded ? '⌃' : '⌄' }}</span>
      </button>
      <div class="word-input">
        <input v-model="word" type="text" placeholder="AI generate word" :disabled="isRunning" @keyup.enter="handleStart" />
      </div>
      <button
        v-if="!isRunning"
        class="generate-button"
        type="button"
        :disabled="isRunning"
        @click="handleStart"
      >
        Generate
      </button>
      <button v-else class="cancel-button" type="button" @click="handleCancel">
        Cancel
      </button>
    </div>

    <div v-if="expanded" class="ai-details">
      <div class="field-grid">
        <label>
          <span>Context</span>
          <input v-model="context" type="text" placeholder="Optional sentence or clue" :disabled="isRunning" />
        </label>
        <label>
          <span>Notes</span>
          <input v-model="notes" type="text" placeholder="Optional generation notes" :disabled="isRunning" />
        </label>
      </div>

      <div v-if="currentJob" class="progress-block">
        <div class="progress-head">
          <span>{{ currentStageLabel }}</span>
          <strong>{{ progressPercent }}%</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
        <div class="step-row">
          <span
            v-for="step in currentJob.steps"
            :key="step.step"
            class="step-pill"
            :class="`step-${step.status}`"
          >
            {{ step.step }}
          </span>
        </div>
        <pre v-if="runningStepTokens" class="token-preview">{{ runningStepTokens }}</pre>
      </div>

      <p v-if="errorMessage || currentJob?.error" class="error-text">
        {{ errorMessage || currentJob?.error }}
        <button
          v-if="currentJob?.status === 'error' && currentJob.error !== 'User cancelled'"
          type="button"
          class="secondary-button"
          @click="handleResume()"
        >
          Retry from failed
        </button>
      </p>

      <div v-if="isComplete" class="result-row">
        <span v-if="reviewScore !== null">Score {{ reviewScore }}/10</span>
        <div class="result-actions">
          <button type="button" class="secondary-button" @click="handleRegenerate">Regenerate</button>
          <button type="button" class="accept-button" @click="handleAcceptYaml">Fill editor</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-generate {
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.ai-main {
  min-height: 46px;
  padding: 6px 10px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 108px;
  align-items: center;
  gap: 8px;
}

.icon-toggle {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--muted);
  cursor: pointer;
}

.word-input input,
.field-grid input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  color: inherit;
  padding: 0 10px;
  font-size: 13px;
  outline: 0;
}

.word-input input:focus,
.field-grid input:focus {
  border-color: var(--green);
  box-shadow: 0 0 0 3px rgba(36, 114, 83, 0.08);
}

.cancel-button {
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--red-border);
  padding: 0 12px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  background: var(--red-soft);
  color: var(--red);
}

.generate-button,
.accept-button,
.secondary-button {
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.generate-button,
.accept-button {
  background: var(--green);
  color: #fff;
}

.generate-button:disabled {
  opacity: 0.56;
  cursor: wait;
}

.secondary-button {
  background: var(--surface-panel);
  border-color: var(--border);
  color: var(--muted);
}

.ai-details {
  padding: 0 10px 10px;
  display: grid;
  gap: 10px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.field-grid label {
  display: grid;
  gap: 4px;
}

.field-grid span,
.progress-head,
.result-row {
  font-size: 12px;
  color: var(--muted);
}

.progress-block {
  display: grid;
  gap: 7px;
}

.progress-head,
.result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.progress-track {
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--faint);
}

.progress-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.2s ease;
}

.step-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.step-pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--muted);
}

.step-complete {
  border-color: rgba(36, 114, 83, 0.3);
  color: var(--green);
}

.step-error {
  border-color: var(--red-border);
  color: var(--red);
}

.error-text {
  margin: 0;
  color: var(--red);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-preview {
  margin: 0;
  padding: 6px 8px;
  background: var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: var(--mono);
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--muted);
}

.result-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 720px) {
  .ai-main,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .icon-toggle {
    display: none;
  }
}
</style>
