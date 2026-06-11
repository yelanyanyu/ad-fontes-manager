<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import type { Ref } from 'vue';
import yaml from 'js-yaml';
import { useWordStore } from '@/stores/wordStore';
import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import type { ConflictData } from '@/types/word-editor';
import request from '@/utils/request';
import { useYamlHierarchy } from '@/composables/useYamlHierarchy';
import { createWordEditorValidationController } from '@/modules/wordEditor/validationController';
import { createFormatFixCommand } from '@/modules/wordEditor/formatFixCommand';
import { hideWordAppMetadataInYaml } from '@/utils/wordMetadata';

interface WordStoreLike {
  editorYaml: string;
  currentEditingId: string | number | null;
  saveWord: (yamlContent: string, force?: boolean) => Promise<boolean | ConflictData>;
  setEditingContext: (context: { id: string | number | null }) => void;
}

interface AppStoreLike {
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const wordStore = useWordStore() as unknown as WordStoreLike;
const appStore = useAppStore() as unknown as AppStoreLike;

const { editorYaml, editorReloadToken, currentEditingId } = storeToRefs(wordStore as any) as {
  editorYaml: Ref<string>;
  editorReloadToken: Ref<number>;
  currentEditingId: Ref<string | number | null>;
};

const input = ref<string>('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const lineNumberRef = ref<HTMLElement | null>(null);
const lineMeasureRef = ref<HTMLElement | null>(null);
const lineHeights = ref<number[]>([]);
const cursorPos = ref(0);
const conflictData = ref<ConflictData | null>(null);
const saving = ref(false);
let lineMeasureFrame: number | null = null;
let editorResizeObserver: ResizeObserver | null = null;

const { breadcrumbPath, lineDepths, cursorLine } = useYamlHierarchy(input, cursorPos);
const validationController = createWordEditorValidationController({
  validateYaml: payload => request.post('/v2/words/validate', payload),
  getIntent: () => (currentEditingId.value ? 'update-existing' : 'create'),
});
const validationState = validationController.state;
const formatFixCommand = createFormatFixCommand({
  state: validationState,
  repairYaml: payload => request.post('/v2/words/validate', payload),
  replaceYaml: yamlContent => {
    input.value = hideWordAppMetadataInYaml(yamlContent);
  },
  addToast: (message, type) => appStore.addToast(message, type),
});
const formatFixState = formatFixCommand.state;

const syncScroll = () => {
  if (textareaRef.value && lineNumberRef.value) {
    lineNumberRef.value.scrollTop = textareaRef.value.scrollTop;
  }
};

function getDefaultLineHeight(): number {
  const textarea = textareaRef.value;
  if (!textarea) return 22;
  const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight);
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 22;
}

function measureLineHeights(): void {
  const textarea = textareaRef.value;
  const measure = lineMeasureRef.value;
  if (!textarea || !measure) return;

  measure.style.width = `${textarea.clientWidth}px`;
  measure.textContent = '';

  const defaultHeight = getDefaultLineHeight();
  const nextHeights = input.value.split('\n').map(line => {
    const row = document.createElement('div');
    row.className = 'line-measure-row';
    row.textContent = line.length > 0 ? line : ' ';
    measure.appendChild(row);
    return Math.max(defaultHeight, row.getBoundingClientRect().height);
  });

  lineHeights.value = nextHeights.length > 0 ? nextHeights : [defaultHeight];
  measure.textContent = '';
  syncScroll();
}

function scheduleLineMeasure(): void {
  if (lineMeasureFrame !== null) window.cancelAnimationFrame(lineMeasureFrame);
  lineMeasureFrame = window.requestAnimationFrame(() => {
    lineMeasureFrame = null;
    measureLineHeights();
  });
}

function updateCursorPos(): void {
  cursorPos.value = textareaRef.value?.selectionStart ?? 0;
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  e.preventDefault();

  const ta = textareaRef.value;
  if (!ta) return;

  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const indent = '  ';

  if (e.shiftKey) {
    const lines = input.value.split('\n');
    const startLine = input.value.slice(0, start).split('\n').length - 1;
    const endLine = input.value.slice(0, end).split('\n').length - 1;

    let newStart = start;
    let newEnd = end;

    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      const leadingSpaces = line.length - line.trimStart().length;
      const removeCount = Math.min(leadingSpaces, 2);

      if (removeCount > 0) {
        lines[i] = line.slice(removeCount);
        if (i === startLine) newStart = Math.max(0, newStart - removeCount);
        newEnd = Math.max(0, newEnd - removeCount);
      }
    }

    input.value = lines.join('\n');
    void nextTick(() => {
      ta.selectionStart = newStart;
      ta.selectionEnd = newEnd;
      updateCursorPos();
    });
  } else {
    if (start === end) {
      input.value = input.value.slice(0, start) + indent + input.value.slice(end);
      void nextTick(() => {
        ta.selectionStart = ta.selectionEnd = start + indent.length;
        updateCursorPos();
      });
    } else {
      const lines = input.value.split('\n');
      const startLine = input.value.slice(0, start).split('\n').length - 1;
      const endLine = input.value.slice(0, end).split('\n').length - 1;

      let addedChars = 0;
      for (let i = startLine; i <= endLine; i++) {
        lines[i] = indent + lines[i];
        addedChars += indent.length;
      }

      input.value = lines.join('\n');
      void nextTick(() => {
        ta.selectionStart = start + indent.length;
        ta.selectionEnd = end + addedChars;
        updateCursorPos();
      });
    }
  }
}

const isEmpty = computed(() => !input.value || input.value.trim().length === 0);
const editorSaveIntentLabel = computed(() => (currentEditingId.value ? 'Editing Word' : 'New Word'));

const saveLabel = 'Save';

onUnmounted(() => {
  validationController.dispose();
  if (lineMeasureFrame !== null) window.cancelAnimationFrame(lineMeasureFrame);
  editorResizeObserver?.disconnect();
});

watch(
  input,
  () => {
    void nextTick(scheduleLineMeasure);
    validationController.handleTextChanged(input.value);
  },
  { flush: 'post' }
);

watch(
  editorReloadToken,
  () => {
    if (typeof editorYaml.value === 'string') {
      input.value = editorYaml.value;
      cursorPos.value = 0;
      void nextTick(scheduleLineMeasure);
    }
  },
  { immediate: true }
);

onMounted(() => {
  scheduleLineMeasure();
  if (textareaRef.value) {
    editorResizeObserver = new ResizeObserver(() => scheduleLineMeasure());
    editorResizeObserver.observe(textareaRef.value);
  }
});

const clear = () => {
  if (saving.value) return;
  input.value = '';
  validationController.reset();
};

const save = async () => {
  if (!input.value || saving.value) return;
  saving.value = true;
  try {
    const res = await wordStore.saveWord(input.value);
    if (res && typeof res === 'object' && 'status' in res && res.status === 'conflict') {
      conflictData.value = res as ConflictData;
    }
  } finally {
    saving.value = false;
  }
};

const repairFormat = async () => {
  await formatFixCommand.run(input.value);
};

const closeConflict = () => {
  if (saving.value) return;
  conflictData.value = null;
  void nextTick(() => textareaRef.value?.focus());
};

const useExisting = () => {
  if (saving.value) return;
  if (!conflictData.value || !conflictData.value.oldData) return;
  try {
    input.value = yamlFormatter.format(conflictData.value.oldData || {});
  } catch {
    input.value = yaml.dump(conflictData.value.oldData || {}, { lineWidth: -1, noRefs: true });
  }
  if (conflictData.value.source === 'local' && conflictData.value.id) {
    wordStore.setEditingContext({ id: conflictData.value.id });
  }
  closeConflict();
};

const overwrite = async () => {
  if (saving.value) return;
  saving.value = true;
  try {
    const ok = await wordStore.saveWord(input.value, true);
    if (ok) {
      conflictData.value = null;
      void nextTick(() => textareaRef.value?.focus());
    }
  } finally {
    saving.value = false;
  }
};

const applyGeneratedYaml = (yamlContent: string) => {
  input.value = hideWordAppMetadataInYaml(yamlContent);
};

defineExpose({ applyGeneratedYaml });
</script>

<template>
  <div class="ui-panel editor-panel">
    <ConflictModal
      :open="!!conflictData"
      title="Conflict Detected"
      :diff="conflictData?.diff || []"
      :left-data="conflictData?.oldData || {}"
      :right-data="conflictData?.newData || {}"
      left-label="Existing"
      right-label="New"
      :subtitle="saving ? 'Saving overwrite to the database. The editor is temporarily locked.' : ''"
      :primary-label="saving ? 'Saving...' : 'Overwrite'"
      secondary-label="Use Existing"
      :busy="saving"
      :formatter="yamlFormatter"
      :diff-adapter="deepDiffAdapter"
      @close="closeConflict"
      @secondary="useExisting"
      @primary="overwrite"
    />

    <div class="ui-panel__head editor-head">
      <div class="ui-panel__title editor-title">
        <strong>YAML Editor</strong>
        <span class="editor-status-line">
          <span
            class="status-dot"
            :class="{
              'dot-valid': validationState.status === 'Valid YAML',
              'dot-invalid': validationState.status === 'Invalid YAML',
              'dot-checking': validationState.status === 'Checking YAML',
              'dot-ready': validationState.status === '',
            }"
          />
          <span class="editor-status-text">{{ validationState.status || 'Ready' }}</span>
          <span class="editor-intent-chip">{{ editorSaveIntentLabel }}</span>
          <span v-if="validationState.schemaFreshness === 'old'" class="editor-freshness-chip">
            旧
          </span>
          <span v-if="validationState.schemaFreshness === 'future'" class="editor-freshness-chip">
            新版
          </span>
        </span>
      </div>
      <div class="head-actions">
        <button
          class="ui-icon-button"
          type="button"
          :disabled="saving || isEmpty"
          title="Clear editor"
          aria-label="Clear editor"
          @click="clear"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="m16 3 5 5-10 10H6l-3-3L13 5z" />
            <path d="M6 18h12" />
          </svg>
        </button>
        <button
          class="ui-button ui-button--quiet head-repair"
          type="button"
          :disabled="isEmpty || saving || formatFixState.repairing"
          title="Repair YAML format"
          @click="repairFormat"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4" />
            <path d="m15 5 4 4" />
          </svg>
          <span class="head-action-label">
            {{ formatFixState.repairing ? 'Repairing...' : 'Repair' }}
          </span>
        </button>
        <button
          :class="[
            'ui-button',
            'head-save',
            isEmpty ? 'ui-button--disabled' : 'ui-button--primary',
          ]"
          :disabled="isEmpty || saving"
          @click="save"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M19 21H5a2 2 0 0 1-2-2V7l4-4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v4h8" />
          </svg>
          <span class="head-action-label">{{ saving ? 'Saving...' : saveLabel }}</span>
        </button>
      </div>
    </div>

    <div v-if="validationState.notices.length" class="editor-notice">
      {{ validationState.notices[0] }}
    </div>

    <div class="breadcrumb-bar">
      <template v-if="breadcrumbPath.length > 0">
        <span class="breadcrumb-root">/</span>
        <span
          v-for="(seg, i) in breadcrumbPath"
          :key="i"
          class="breadcrumb-segment"
        >
          <span class="breadcrumb-sep">&#x25B8;</span>
          <span
            class="breadcrumb-label"
            :class="{ 'is-list-item': seg.isListItem }"
          >{{ seg.key }}</span>
        </span>
      </template>
      <span v-else class="breadcrumb-empty">---</span>
    </div>

    <div class="editor-area">
      <div ref="lineNumberRef" class="line-number">
        <div
          v-for="(info, idx) in lineDepths"
          :key="idx"
          class="ln-row"
          :class="{ 'ln-row-active': idx === cursorLine }"
          :style="{ height: `${lineHeights[idx] || getDefaultLineHeight()}px` }"
        >
          <span class="ln-num">{{ idx + 1 }}</span>
          <span v-if="info.depth > 0" class="ln-dots">
            <span
              v-for="d in Math.min(info.depth, 8)"
              :key="d"
              class="ln-dot"
              :style="{ opacity: 0.2 + (d / 8) * 0.5 }"
            />
          </span>
        </div>
      </div>
      <div class="editor-input">
        <textarea
          ref="textareaRef"
          v-model="input"
          spellcheck="false"
          placeholder="每行输入 YAML 内容，例如：lemma: apple..."
          @scroll="syncScroll"
          @click="updateCursorPos"
          @keyup="updateCursorPos"
          @keydown="handleKeydown"
        />
        <div ref="lineMeasureRef" class="line-measure" aria-hidden="true" />
      </div>
    </div>

    <div v-if="validationState.schemaErrors.length > 0" class="schema-errors">
      <ul>
        <li v-for="(err, i) in validationState.schemaErrors" :key="i">{{ err }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.editor-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  flex: 1;
}

.editor-head {
  gap: 12px;
  min-width: 0;
}

.editor-title {
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
}

.editor-title strong {
  flex: 0 0 auto;
  white-space: nowrap;
}

.editor-status-line {
  min-width: 0;
  flex: 1 1 auto;
  white-space: nowrap;
}

.editor-status-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-valid {
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(36, 114, 83, 0.08);
}

.dot-invalid {
  background: var(--red);
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.dot-ready {
  background: var(--faint);
  box-shadow: 0 0 0 3px rgba(155, 148, 138, 0.1);
}

.dot-checking {
  background: var(--blue);
  box-shadow: 0 0 0 3px rgba(44, 96, 143, 0.1);
}

.editor-intent-chip,
.editor-freshness-chip {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0;
  font-family: var(--sans);
  white-space: nowrap;
}

.editor-intent-chip {
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--muted);
}

.editor-freshness-chip {
  border: 1px solid rgba(176, 103, 25, 0.32);
  background: rgba(176, 103, 25, 0.12);
  color: #8a4d13;
}

.editor-notice {
  border-bottom: 1px solid rgba(176, 103, 25, 0.22);
  background: rgba(176, 103, 25, 0.08);
  color: #7c4713;
  padding: 8px 20px;
  font-size: 12px;
  font-weight: 620;
}

[data-theme="dark"] .dot-valid {
  box-shadow: 0 0 0 3px rgba(67, 179, 127, 0.1);
}

[data-theme="dark"] .dot-invalid {
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.15);
}

[data-theme="dark"] .dot-ready {
  box-shadow: 0 0 0 3px rgba(127, 119, 111, 0.1);
}

[data-theme="dark"] .dot-checking {
  box-shadow: 0 0 0 3px rgba(89, 158, 216, 0.14);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.head-save {
  min-width: 92px;
  height: 30px;
  padding: 0 11px;
}

.head-repair {
  height: 30px;
  padding: 0 10px;
}

.head-action-label {
  white-space: nowrap;
}

.head-repair:hover:not(:disabled),
.head-repair:focus-visible {
  border-color: rgba(44, 96, 143, 0.35);
  color: var(--blue);
  background: rgba(44, 96, 143, 0.08);
}

.editor-area {
  min-height: 0;
  background: var(--editor-field);
  display: grid;
  grid-template-columns: 46px 1fr;
  border-bottom: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.72;
  color: #3b3732;
}

[data-theme="dark"] .editor-area {
  color: #d8d0c5;
}

.breadcrumb-bar {
  height: 22px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--faint);
  background: var(--editor-field);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
  white-space: nowrap;
}

[data-theme="dark"] .breadcrumb-bar {
  background: #1b1814;
}

.breadcrumb-root {
  color: var(--faint);
  margin-right: 3px;
}

.breadcrumb-sep {
  margin: 0 3px;
  color: var(--border-strong);
  font-size: 10px;
}

.breadcrumb-label {
  color: var(--muted);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breadcrumb-label.is-list-item {
  color: var(--blue);
}

.breadcrumb-empty {
  color: var(--border-strong);
  font-style: italic;
}

.line-number {
  padding-top: 18px;
  padding-bottom: 18px;
  color: #b5ada2;
  border-right: 1px solid var(--line);
  user-select: none;
  overflow: hidden;
  line-height: 1.72;
  font-size: 13px;
  box-sizing: border-box;
}

[data-theme="dark"] .line-number {
  color: #706961;
  background: #1b1814;
}

.ln-row {
  display: flex;
  align-items: flex-start;
  height: calc(1em * 1.72);
  padding: 0 4px;
}

.ln-row-active {
  background: rgba(36, 114, 83, 0.06);
}

[data-theme="dark"] .ln-row-active {
  background: rgba(67, 179, 127, 0.08);
}

.ln-num {
  width: 22px;
  text-align: right;
  color: var(--faint);
  flex-shrink: 0;
  font-size: 12px;
}

.ln-dots {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  min-width: 10px;
  flex-shrink: 0;
}

.ln-dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--faint);
  flex-shrink: 0;
}

.editor-input {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.editor-input textarea {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  box-sizing: border-box;
  padding: 18px 16px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.line-measure {
  position: absolute;
  inset: 0 auto auto 0;
  box-sizing: border-box;
  padding: 18px 16px;
  visibility: hidden;
  pointer-events: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  font: inherit;
  line-height: inherit;
  color: transparent;
  z-index: -1;
}

:deep(.line-measure-row) {
  min-height: calc(1em * 1.72);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.editor-input textarea::placeholder {
  color: #9a9389;
}

[data-theme="dark"] .editor-input textarea::placeholder {
  color: #80786f;
}

.schema-errors {
  padding: 8px 14px;
  background: var(--red-soft);
  border-top: 1px solid var(--red-border);
}

.schema-errors ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.schema-errors li {
  font-size: 12px;
  color: var(--red);
  line-height: 1.6;
}

@media (max-width: 860px) {
  .editor-head {
    min-height: 48px;
    height: auto;
    padding: 8px 12px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .editor-title {
    flex-basis: 100%;
    gap: 10px;
  }

  .head-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .editor-notice {
    padding-inline: 12px;
  }
}

@media (max-width: 520px) {
  .editor-title {
    gap: 8px;
  }

  .editor-status-line {
    gap: 6px;
  }

  .editor-intent-chip {
    max-width: 76px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .head-repair,
  .head-save {
    width: 34px;
    min-width: 34px;
    padding: 0;
  }

  .head-action-label {
    display: none;
  }
}

</style>
