<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue';
import {
  parseBatchJson,
  parseBatchText,
  type BatchGenerateDraftItem,
} from '@/services/batchGenerateParser';

type BatchSource = 'text' | 'json';

const props = defineProps<{
  submitting: boolean;
  running: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [items: BatchGenerateDraftItem[]];
}>();

const batchSource = ref<BatchSource>('text');
const batchText = ref('');
const batchFileName = ref('');
const batchTextarea = ref<HTMLTextAreaElement | null>(null);
const batchFileInput = ref<HTMLInputElement | null>(null);
const batchInfoBtn = ref<HTMLButtonElement | null>(null);
const batchActionBtn = ref<HTMLButtonElement | null>(null);
const showHelp = ref(false);
const helpStyle = ref({ top: '0px', left: '0px' });
const showActionTip = ref(false);
const actionTipStyle = ref({ top: '0px', left: '0px' });
let actionTipTimer: ReturnType<typeof setTimeout> | null = null;

const batchParseResult = computed(() =>
  batchSource.value === 'json'
    ? parseBatchJson(batchText.value)
    : parseBatchText(batchText.value)
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
const batchStatsText = computed(() => {
  const invalid = batchParseResult.value.invalid.length;
  const parts = [
    `${batchItems.value.length} words`,
    `${missingContextCount.value} without context`,
    `${missingNotesCount.value} without notes`,
  ];
  if (invalid) parts.push(`${invalid} invalid`);
  if (batchFileName.value) parts.push(batchFileName.value);
  return parts.join(' · ');
});
const createBatchDisabledReason = computed(() => {
  if (props.submitting) return 'Creating batch...';
  if (!batchText.value.trim()) return 'Enter at least one word before creating a batch.';
  if (batchParseResult.value.invalid.length > 0) return batchParseResult.value.invalid[0];
  if (batchItems.value.length === 0) return 'No valid words found in the batch input.';
  return '';
});
const batchActionTipText = computed(() =>
  batchSource.value === 'json' ? 'Import JSON file' : 'Insert a word/context/notes block'
);

onUnmounted(() => {
  if (actionTipTimer) clearTimeout(actionTipTimer);
});

function getFloatingStyle(anchor: HTMLElement, width: number): { top: string; left: string } {
  const rect = anchor.getBoundingClientRect();
  const viewportPadding = 8;
  return {
    top: `${rect.bottom + 6}px`,
    left: `${Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding
    )}px`,
  };
}

function setBatchSource(source: BatchSource): void {
  batchSource.value = source;
  if (source === 'text') {
    batchFileName.value = '';
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

function openBatchFilePicker(): void {
  batchFileInput.value?.click();
}

async function appendBatchDraftBlock(): Promise<void> {
  batchSource.value = 'text';
  batchFileName.value = '';

  const baseText = batchText.value.trimEnd();
  const separator = baseText ? '\n\n' : '';
  const cursorPosition = baseText.length + separator.length;
  batchText.value = `${baseText}${separator}\ncontext:\nnotes:`;

  await nextTick();
  batchTextarea.value?.focus();
  batchTextarea.value?.setSelectionRange(cursorPosition, cursorPosition);
}

function showBatchHelp(): void {
  if (!batchInfoBtn.value) return;
  helpStyle.value = getFloatingStyle(batchInfoBtn.value, 260);
  showHelp.value = true;
}

function showBatchActionTip(): void {
  if (!batchActionBtn.value) return;
  actionTipStyle.value = getFloatingStyle(batchActionBtn.value, 220);
  showActionTip.value = true;
}

function scheduleBatchActionTip(): void {
  if (actionTipTimer) clearTimeout(actionTipTimer);
  actionTipTimer = setTimeout(showBatchActionTip, 450);
}

function hideBatchActionTip(): void {
  if (actionTipTimer) clearTimeout(actionTipTimer);
  actionTipTimer = null;
  showActionTip.value = false;
}

function handleSubmit(): void {
  if (!canStartBatch.value) return;
  emit('submit', batchItems.value);
}
</script>

<template>
  <section class="batch-panel" aria-label="Batch input">
    <div class="batch-toolbar">
      <div class="batch-toolbar-main">
        <div class="batch-source-segmented" role="radiogroup" aria-label="Batch source">
          <button
            type="button"
            :class="{ active: batchSource === 'text' }"
            role="radio"
            :aria-checked="batchSource === 'text'"
            @click="setBatchSource('text')"
          >
            Text
          </button>
          <button
            type="button"
            :class="{ active: batchSource === 'json' }"
            role="radio"
            :aria-checked="batchSource === 'json'"
            @click="setBatchSource('json')"
          >
            JSON
          </button>
        </div>
        <button
          ref="batchInfoBtn"
          type="button"
          class="batch-info-button"
          aria-label="Batch input help"
          @mouseenter="showBatchHelp"
          @mouseleave="showHelp = false"
          @focus="showBatchHelp"
          @blur="showHelp = false"
        >
          ?
        </button>
      </div>
      <button
        v-if="batchSource === 'text'"
        ref="batchActionBtn"
        type="button"
        class="ui-icon-button batch-toolbar-action"
        aria-label="Add word block"
        @mouseenter="scheduleBatchActionTip"
        @mouseleave="hideBatchActionTip"
        @focus="showBatchActionTip"
        @blur="hideBatchActionTip"
        @click="appendBatchDraftBlock"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        v-else
        ref="batchActionBtn"
        type="button"
        class="ui-icon-button batch-toolbar-action"
        aria-label="Import JSON file"
        @mouseenter="scheduleBatchActionTip"
        @mouseleave="hideBatchActionTip"
        @focus="showBatchActionTip"
        @blur="hideBatchActionTip"
        @click="openBatchFilePicker"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 21h14" />
          <path d="M5 17v4" />
          <path d="M19 17v4" />
        </svg>
      </button>
      <input
        ref="batchFileInput"
        class="batch-file-input"
        type="file"
        accept="application/json,.json"
        @change="handleBatchFileChange"
      />
    </div>
    <textarea
      ref="batchTextarea"
      v-model="batchText"
      class="ui-textarea batch-textarea"
      :placeholder="batchPlaceholder"
    />
    <div v-if="batchItems.length" class="batch-preview">
      <div v-for="item in batchItems.slice(0, 5)" :key="item.word" class="batch-preview-row">
        <strong>{{ item.word }}</strong>
        <span>{{ item.context || 'No context' }}</span>
      </div>
    </div>
    <div class="batch-action-bar">
      <div class="batch-status" aria-live="polite">
        <span>{{ batchStatsText }}</span>
        <span
          v-if="createBatchDisabledReason"
          class="batch-disabled-reason"
        >
          {{ createBatchDisabledReason }}
        </span>
      </div>
      <button
        type="button"
        class="ui-button ui-button--primary drawer-button"
        :disabled="!canStartBatch || submitting"
        :title="createBatchDisabledReason || 'Create a batch from the parsed words'"
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

  <Teleport to="body">
    <span
      v-if="showHelp"
      class="batch-floating-popover batch-help"
      :style="helpStyle"
      @mouseenter="showHelp = true"
      @mouseleave="showHelp = false"
    >
      Text: one word per line, or blank-line blocks with word/context/notes. JSON:
      items array with word, context, and notes fields. Only word is required.
    </span>
    <span
      v-if="showActionTip"
      class="batch-floating-popover batch-action-tooltip"
      :style="actionTipStyle"
      role="tooltip"
    >
      {{ batchActionTipText }}
    </span>
  </Teleport>
</template>

<style scoped>
.batch-panel {
  display: grid;
  gap: 8px;
}

.batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.batch-toolbar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.batch-source-segmented {
  height: 28px;
  min-width: 128px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  padding: 2px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
}

.batch-source-segmented button {
  min-width: 0;
  height: 22px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.batch-source-segmented button.active {
  background: var(--green-soft);
  color: var(--green);
}

.batch-source-segmented button:focus-visible {
  outline: 2px solid var(--green-border);
  outline-offset: 1px;
}

.batch-info-button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
}

.batch-floating-popover {
  position: fixed;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel);
  color: var(--text-soft);
  box-shadow: var(--shadow-md);
  font-size: 11px;
  text-align: left;
  z-index: 90;
}

.batch-help {
  width: 260px;
  padding: 10px;
  line-height: 1.5;
}

.batch-action-tooltip {
  max-width: 220px;
  padding: 7px 9px;
  line-height: 1.35;
  font-weight: 650;
  white-space: nowrap;
}

.batch-toolbar-action {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  padding: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
}

.batch-toolbar-action svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.batch-file-input {
  display: none;
}

.batch-textarea {
  min-height: 156px;
  max-height: 240px;
  resize: vertical;
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.55;
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

.batch-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding-top: 2px;
}

.batch-status {
  min-width: 0;
  display: grid;
  gap: 2px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.batch-status span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-disabled-reason {
  color: var(--amber);
}

.drawer-button {
  height: 32px;
  border-radius: var(--radius-sm);
  padding: 0 12px;
  font-size: 12px;
  font-weight: 650;
}
</style>
