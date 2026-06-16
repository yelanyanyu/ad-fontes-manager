<script setup lang="ts">
import { computed } from 'vue';
import { buildPreviewContent } from '@/modules/previewContent';
import type { JobState } from '@/composables/useAiGenerate';

const props = defineProps<{
  job: JobState;
}>();

const emit = defineEmits<{
  close: [];
  'yaml-ready': [yaml: string, sourceJobId?: string | null];
}>();

const previewContent = computed(() => buildPreviewContent(props.job.yaml));
const rawData = computed(() => previewContent.value.rawData);
const content = computed(() => previewContent.value.html);
const schemaNoticeText = computed(() => {
  if (previewContent.value.schemaFreshness === 'old') return '旧 - 可预览，保存为新词条前需要重新生成';
  if (previewContent.value.schemaFreshness === 'future') return '新版 - 当前应用可能无法完整显示';
  return '';
});

function fillEditor(): void {
  if (props.job.yaml) emit('yaml-ready', props.job.yaml, props.job.jobId);
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
        <span>{{ previewContent.error || 'This Job finished without a previewable YAML payload.' }}</span>
      </section>
      <section v-else class="card-stage">
        <div v-if="schemaNoticeText" class="schema-notice">{{ schemaNoticeText }}</div>
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

.schema-notice {
  margin: 0 0 12px;
  border: 1px solid rgba(176, 103, 25, 0.3);
  border-radius: var(--radius-md);
  background: rgba(176, 103, 25, 0.1);
  color: #7c4713;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 650;
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
