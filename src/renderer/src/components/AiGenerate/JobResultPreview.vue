<script setup lang="ts">
import { computed } from 'vue';
import yaml from 'js-yaml';
import { generateCardHTML } from '@/utils/generator';
import type { JobState } from '@/composables/useAiGenerate';
import type { PreviewYamlData } from '@/types/word-preview';

const props = defineProps<{
  job: JobState;
}>();

const emit = defineEmits<{
  close: [];
  'yaml-ready': [yaml: string];
}>();

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
  return generateCardHTML(rawData.value);
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
      <section v-else class="card-stage">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="rendered-card" v-html="content" />
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
.primary-button {
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

.empty-state {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
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
