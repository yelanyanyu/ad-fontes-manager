<script setup lang="ts">
import { computed, ref } from 'vue';
import { marked } from 'marked';
import yaml from 'js-yaml';
import { generateCardHTML, generateMarkdown } from '@/utils/generator';
import type { JobState } from '@/composables/useAiGenerate';
import type { PreviewMode, PreviewYamlData } from '@/types/word-preview';

const props = defineProps<{
  job: JobState;
}>();

const emit = defineEmits<{
  close: [];
  'yaml-ready': [yaml: string];
}>();

const mode = ref<PreviewMode>('card');

const rawData = computed<PreviewYamlData | null>(() => {
  if (!props.job.yaml) return null;
  try {
    const parsed = yaml.load(props.job.yaml);
    return parsed && typeof parsed === 'object' ? (parsed as PreviewYamlData) : null;
  } catch {
    return null;
  }
});

const content = computed(() => {
  if (!rawData.value) return '';
  if (mode.value === 'card') return generateCardHTML(rawData.value);
  const parsed = marked.parse(generateMarkdown(rawData.value));
  return typeof parsed === 'string' ? parsed : '';
});

function fillEditor(): void {
  if (props.job.yaml) emit('yaml-ready', props.job.yaml);
}
</script>

<template>
  <div class="job-preview">
    <header class="preview-head">
      <button type="button" class="back-button" @click="emit('close')">Back</button>
      <div class="title-block">
        <span>Job Result Preview</span>
        <strong>{{ job.word }}</strong>
      </div>
      <div class="head-actions">
        <div class="mode-control">
          <button type="button" :class="{ active: mode === 'card' }" @click="mode = 'card'">
            Card
          </button>
          <button
            type="button"
            :class="{ active: mode === 'markdown' }"
            @click="mode = 'markdown'"
          >
            Markdown
          </button>
        </div>
        <button type="button" class="primary-button" :disabled="!job.yaml" @click="fillEditor">
          Fill Editor
        </button>
      </div>
    </header>

    <main class="preview-body">
      <section v-if="!rawData" class="empty-state">
        <strong>No YAML result</strong>
        <span>This Job finished without a previewable YAML payload.</span>
      </section>
      <section v-else-if="mode === 'card'" class="card-stage">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="rendered-card" v-html="content" />
      </section>
      <section v-else class="markdown-stage">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="markdown-body" v-html="content" />
        <pre>{{ job.yaml }}</pre>
      </section>
    </main>
  </div>
</template>

<style scoped>
.job-preview {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: var(--bg-bottom);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-head {
  height: 64px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 252, 0.84);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  gap: 14px;
}

[data-theme="dark"] .preview-head {
  background: rgba(24, 22, 20, 0.84);
}

.back-button,
.primary-button,
.mode-control button {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.back-button {
  height: 32px;
  padding: 0 12px;
}

.title-block {
  min-width: 0;
  flex: 1;
}

.title-block span {
  display: block;
  color: var(--muted);
  font-size: 11px;
}

.title-block strong {
  display: block;
  color: var(--text);
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.mode-control button {
  height: 30px;
  min-width: 76px;
  border: 0;
  border-radius: 0;
  color: var(--muted);
}

.mode-control button.active {
  background: var(--green-soft);
  color: var(--green);
}

.primary-button {
  height: 32px;
  padding: 0 12px;
  background: var(--green);
  color: #fff;
  border-color: var(--green);
}

.primary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 28px;
}

.card-stage {
  max-width: 980px;
  margin: 0 auto;
}

.rendered-card {
  width: 100%;
}

.markdown-stage {
  max-width: 900px;
  margin: 0 auto;
  display: grid;
  gap: 16px;
}

.markdown-body,
.markdown-stage pre,
.empty-state {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.markdown-body {
  padding: 22px;
}

.markdown-stage pre {
  margin: 0;
  padding: 16px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  white-space: pre-wrap;
}

.empty-state {
  max-width: 420px;
  margin: 64px auto 0;
  padding: 22px;
  display: grid;
  gap: 6px;
  text-align: center;
}

.empty-state strong {
  color: var(--text);
}

.empty-state span {
  color: var(--muted);
  font-size: 13px;
}
</style>
