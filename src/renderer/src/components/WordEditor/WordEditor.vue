<script setup lang="ts">
import { ref, watch, computed, onUnmounted, nextTick } from 'vue';
import type { Ref } from 'vue';
import yaml from 'js-yaml';
import { useWordStore } from '@/stores/wordStore';
import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import type { ConflictData, EditorStatus } from '@/types/word-editor';
import request from '@/utils/request';
import { useYamlHierarchy } from '@/composables/useYamlHierarchy';

interface WordStoreLike {
  editorYaml: string;
  saveWord: (yamlContent: string, force?: boolean) => Promise<boolean | ConflictData>;
  setEditingContext: (context: { id: string | null }) => void;
}

interface AppStoreLike {
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const wordStore = useWordStore() as unknown as WordStoreLike;
const appStore = useAppStore() as unknown as AppStoreLike;

const { editorYaml, editorReloadToken } = storeToRefs(wordStore as any) as {
  editorYaml: Ref<string>;
  editorReloadToken: Ref<number>;
};

const input = ref<string>('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const lineNumberRef = ref<HTMLElement | null>(null);
const cursorPos = ref(0);
const status = ref<EditorStatus>('');
const conflictData = ref<ConflictData | null>(null);
const schemaErrors = ref<string[]>([]);
const validating = ref(false);
const saving = ref(false);
let validateTimer: ReturnType<typeof setTimeout> | null = null;
let clientParseTimer: ReturnType<typeof setTimeout> | null = null;

const { breadcrumbPath, lineDepths, cursorLine } = useYamlHierarchy(input, cursorPos);

const syncScroll = () => {
  if (textareaRef.value && lineNumberRef.value) {
    lineNumberRef.value.scrollTop = textareaRef.value.scrollTop;
  }
};

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
    });
  } else {
    if (start === end) {
      input.value = input.value.slice(0, start) + indent + input.value.slice(end);
      void nextTick(() => {
        ta.selectionStart = ta.selectionEnd = start + indent.length;
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
      });
    }
  }
}

const isEmpty = computed(() => !input.value || input.value.trim().length === 0);

const saveLabel = 'Save';

const handleInput = () => {
  if (!input.value || input.value.trim().length === 0) {
    status.value = '';
    schemaErrors.value = [];
    if (clientParseTimer) clearTimeout(clientParseTimer);
    return;
  }

  try {
    const result = yaml.load(input.value) as Record<string, unknown> | null;
    if (
      result &&
      typeof result === 'object' &&
      !Array.isArray(result) &&
      result.yield !== undefined
    ) {
      status.value = 'Valid YAML';
    } else {
      status.value = 'Invalid YAML';
      schemaErrors.value = [];
      return;
    }
  } catch {
    status.value = 'Invalid YAML';
    schemaErrors.value = [];
    return;
  }

  if (validateTimer) clearTimeout(validateTimer);
  validateTimer = setTimeout(async () => {
    validating.value = true;
    try {
      const res = await request.post<{
        valid: boolean;
        errors: string[];
        language?: string;
      }>('/v2/words/validate', { yaml: input.value });

      if (res.valid) {
        schemaErrors.value = [];
        status.value = 'Valid YAML';
      } else {
        schemaErrors.value = res.errors || [];
        status.value = 'Invalid YAML';
      }
    } catch {
      schemaErrors.value = [];
    } finally {
      validating.value = false;
    }
  }, 300);
};

const onEditorInput = () => {
  if (clientParseTimer) clearTimeout(clientParseTimer);
  clientParseTimer = setTimeout(() => handleInput(), 150);
};

onUnmounted(() => {
  if (validateTimer) clearTimeout(validateTimer);
  if (clientParseTimer) clearTimeout(clientParseTimer);
});

watch(
  editorReloadToken,
  () => {
    if (typeof editorYaml.value === 'string') {
      input.value = editorYaml.value;
      cursorPos.value = 0;
      handleInput();
    }
  },
  { immediate: true }
);

const clear = () => {
  if (saving.value) return;
  input.value = '';
  status.value = '';
  schemaErrors.value = [];
};

const save = async () => {
  if (!input.value || saving.value) return;
  if (status.value === 'Invalid YAML') {
    appStore.addToast('Cannot save: Invalid YAML format', 'error');
    return;
  }
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
  handleInput();
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
  input.value = yamlContent;
  handleInput();
};

defineExpose({ applyGeneratedYaml });
</script>

<template>
  <div class="panel editor-panel">
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

    <div class="panel-head">
      <div class="panel-title">
        <strong>YAML Editor</strong>
        <span>
          <span
            class="status-dot"
            :class="{
              'dot-valid': status === 'Valid YAML',
              'dot-invalid': status === 'Invalid YAML',
              'dot-ready': status === '',
            }"
          />
          {{ status || 'Ready' }}
        </span>
      </div>
      <div class="head-actions">
        <button
          class="head-icon-button"
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
          :class="['btn', 'head-save', isEmpty ? 'btn-disabled' : 'btn-primary']"
          :disabled="isEmpty || saving"
          @click="save"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M19 21H5a2 2 0 0 1-2-2V7l4-4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v4h8" />
          </svg>
          {{ saving ? 'Saving...' : saveLabel }}
        </button>
      </div>
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
          @input="onEditorInput"
          @scroll="syncScroll"
          @click="updateCursorPos"
          @keyup="updateCursorPos"
          @keydown="handleKeydown"
        />
      </div>
    </div>

    <div v-if="schemaErrors.length > 0" class="schema-errors">
      <ul>
        <li v-for="(err, i) in schemaErrors" :key="i">{{ err }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.panel {
  min-height: 0;
  overflow: hidden;
  background: var(--surface-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  flex: 1;
}

.editor-panel {
  display: grid;
  grid-template-rows: 48px auto minmax(0, 1fr) auto;
}

.panel-head {
  height: 48px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, #fffefa, #fbf8f2);
  flex: none;
}

[data-theme="dark"] .panel-head {
  background: linear-gradient(180deg, #2a261f, #221f1a);
}

.panel-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.panel-title strong {
  font-size: 14px;
  font-weight: 740;
  letter-spacing: 0.055em;
  color: #2f2b26;
  text-transform: uppercase;
}

[data-theme="dark"] .panel-title strong {
  color: #eee8de;
}

.panel-title span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
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

[data-theme="dark"] .dot-valid {
  box-shadow: 0 0 0 3px rgba(67, 179, 127, 0.1);
}

[data-theme="dark"] .dot-invalid {
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.15);
}

[data-theme="dark"] .dot-ready {
  box-shadow: 0 0 0 3px rgba(127, 119, 111, 0.1);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.head-icon-button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: #8f877e;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.head-icon-button svg {
  width: 15px;
  height: 15px;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.head-icon-button:hover:not(:disabled),
.head-icon-button:focus-visible {
  border-color: rgba(36, 114, 83, 0.35);
  color: var(--green);
  background: var(--green-soft);
}

.head-icon-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.head-save {
  min-width: 92px;
  height: 30px;
  padding: 0 11px;
}

[data-theme="dark"] .head-icon-button {
  background: #211e19;
  color: #8d857b;
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
  color: #b5ada2;
  border-right: 1px solid var(--line);
  user-select: none;
  overflow: hidden;
  line-height: 1.72;
  font-size: 13px;
}

[data-theme="dark"] .line-number {
  color: #706961;
  background: #1b1814;
}

.ln-row {
  display: flex;
  align-items: center;
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
  padding: 18px 16px;
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

/* Button system (shared) */
.btn {
  height: 34px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 560;
  white-space: nowrap;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}

.btn svg {
  width: 14px;
  height: 14px;
}

.btn-primary {
  background: var(--green);
  color: #fff;
  box-shadow: 0 6px 14px rgba(36, 114, 83, 0.16);
}

.btn-primary:hover {
  background: var(--green-hover);
}

[data-theme="dark"] .btn-primary {
  color: #08100c;
  box-shadow: 0 6px 18px rgba(67, 179, 127, 0.18);
}

.btn-disabled {
  opacity: 0.48;
  box-shadow: none;
  pointer-events: none;
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--muted);
}
</style>
