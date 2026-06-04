<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import {
  parseBatchJson,
  parseBatchText,
  type BatchGenerateDraftItem,
} from '@/services/batchGenerateParser';

type BatchSource = 'text' | 'json';

defineProps<{
  submitting: boolean;
  running: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [items: BatchGenerateDraftItem[]];
}>();

const batchSource = ref<BatchSource>('text');
const batchText = ref('');
const debouncedBatchText = ref('');
const batchFileName = ref('');
const batchTextarea = ref<HTMLTextAreaElement | null>(null);
let batchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(batchText, val => {
  if (batchDebounceTimer) clearTimeout(batchDebounceTimer);
  batchDebounceTimer = setTimeout(() => {
    debouncedBatchText.value = val;
  }, 150);
});

onUnmounted(() => {
  if (batchDebounceTimer) clearTimeout(batchDebounceTimer);
});

const batchParseResult = computed(() =>
  batchSource.value === 'json'
    ? parseBatchJson(debouncedBatchText.value)
    : parseBatchText(debouncedBatchText.value)
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

async function handleBatchFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  batchFileName.value = file.name;
  batchSource.value = 'json';
  batchText.value = await file.text();
  target.value = '';
}

async function appendBatchDraftBlock(): Promise<void> {
  batchSource.value = 'text';
  batchFileName.value = '';

  const baseText = batchText.value.trimEnd();
  const separator = baseText ? '\n\n' : '';
  const cursorPosition = baseText.length + separator.length;
  batchText.value = `${baseText}${separator}\ncontext:\nnotes:`;
  debouncedBatchText.value = batchText.value;

  await nextTick();
  batchTextarea.value?.focus();
  batchTextarea.value?.setSelectionRange(cursorPosition, cursorPosition);
}

function handleSubmit(): void {
  if (!canStartBatch.value) return;
  emit('submit', batchItems.value);
}
</script>

<template>
  <section class="batch-source-row" aria-label="Batch options">
    <span>Input</span>
    <select
      v-model="batchSource"
      class="batch-source-select"
      aria-label="Batch source"
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
  </section>

  <section class="batch-panel">
    <div v-if="batchSource === 'text'" class="batch-toolbar">
      <button type="button" class="file-button" @click="appendBatchDraftBlock">
        Add Word
      </button>
    </div>

    <div v-if="batchSource === 'json'" class="batch-toolbar">
      <span>Import the browser-extension JSON contract.</span>
      <label class="file-button">
        Import JSON
        <input type="file" accept="application/json,.json" @change="handleBatchFileChange" />
      </label>
    </div>

    <textarea
      ref="batchTextarea"
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
    <p v-if="batchParseResult.invalid.length" class="ui-error-text batch-error">
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
        class="ui-button ui-button--primary drawer-button"
        :disabled="!canStartBatch || submitting"
        @click="handleSubmit"
      >
        {{ submitting ? 'Creating...' : 'Create Batch' }}
      </button>
      <button
        v-if="running"
        type="button"
        class="ui-button ui-button--danger drawer-button"
        @click="emit('cancel')"
      >
        Cancel selected
      </button>
    </div>
  </section>
</template>

<style scoped>
.batch-source-row {
  position: sticky;
  top: 38px;
  z-index: 11;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: -8px -2px 0;
  padding: 2px 2px 8px;
  background: var(--surface-panel);
  color: var(--muted);
  font-size: 12px;
}

.batch-source-row span {
  flex: 0 0 auto;
  color: var(--muted);
}

.batch-source-row .batch-info-button {
  flex: 0 0 auto;
}

.batch-source-select {
  height: 24px;
  width: auto;
  min-width: 112px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--text-soft);
  padding: 0 22px 0 8px;
  font-size: 11px;
  font-weight: 650;
  outline: 0;
}

.batch-source-select:focus {
  border-color: var(--green-border);
  color: var(--green);
}

.batch-info-button {
  position: relative;
  width: 22px;
  height: 22px;
  margin-right: 4px;
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

.batch-error {
  margin: 0;
  font-size: 12px;
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

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-button {
  height: 32px;
  border-radius: var(--radius-sm);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 650;
}
</style>
