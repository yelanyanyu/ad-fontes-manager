<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import yaml from 'js-yaml';
import { useWordStore } from '@/stores/wordStore';
import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import AiGenerateBar from '@/components/AiGenerate/AiGenerateBar.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import type { ConflictData, EditorStatus } from '@/types/word-editor';
import request from '@/utils/request';

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
const status = ref<EditorStatus>('');
const conflictData = ref<ConflictData | null>(null);
const schemaErrors = ref<string[]>([]);
const validating = ref(false);
let validateTimer: ReturnType<typeof setTimeout> | null = null;

const syncScroll = () => {
  if (textareaRef.value && lineNumberRef.value) {
    lineNumberRef.value.scrollTop = textareaRef.value.scrollTop;
  }
};

const isEmpty = computed(() => !input.value || input.value.trim().length === 0);

const lineCount = computed(() => {
  if (!input.value) return 1;
  return input.value.split('\n').length;
});

const saveLabel = 'Save';

const handleInput = () => {
  if (!input.value || input.value.trim().length === 0) {
    status.value = '';
    schemaErrors.value = [];
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

onUnmounted(() => {
  if (validateTimer) clearTimeout(validateTimer);
});

watch(
  editorReloadToken,
  () => {
    if (typeof editorYaml.value === 'string') {
      input.value = editorYaml.value;
      handleInput();
    }
  },
  { immediate: true }
);

const clear = () => {
  input.value = '';
  status.value = '';
  schemaErrors.value = [];
};

const save = async () => {
  if (!input.value) return;
  if (status.value === 'Invalid YAML') {
    appStore.addToast('Cannot save: Invalid YAML format', 'error');
    return;
  }
  const res = await wordStore.saveWord(input.value);
  if (res && typeof res === 'object' && 'status' in res && res.status === 'conflict') {
    conflictData.value = res as ConflictData;
  }
};

const closeConflict = () => {
  conflictData.value = null;
};

const useExisting = () => {
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
  const ok = await wordStore.saveWord(input.value, true);
  if (ok) closeConflict();
};

const applyGeneratedYaml = (yamlContent: string) => {
  input.value = yamlContent;
  handleInput();
};
</script>

<template>
  <div class="panel editor-panel">
    <AiGenerateBar @yaml-ready="applyGeneratedYaml" />

    <ConflictModal
      :open="!!conflictData"
      title="Conflict Detected"
      :diff="conflictData?.diff || []"
      :left-data="conflictData?.oldData || {}"
      :right-data="conflictData?.newData || {}"
      left-label="Existing"
      right-label="New"
      primary-label="Overwrite"
      secondary-label="Use Existing"
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
      <button class="head-link" @click="clear">Clear</button>
    </div>

    <div class="editor-area">
      <div ref="lineNumberRef" class="line-number">
        <template v-for="n in lineCount" :key="n">{{ n }}<br /></template>
      </div>
      <div class="editor-input">
        <textarea
          ref="textareaRef"
          v-model="input"
          spellcheck="false"
          placeholder="每行输入 YAML 内容，例如：lemma: apple..."
          @input="handleInput"
          @scroll="syncScroll"
        />
      </div>
    </div>

    <div v-if="schemaErrors.length > 0" class="schema-errors">
      <ul>
        <li v-for="(err, i) in schemaErrors" :key="i">{{ err }}</li>
      </ul>
    </div>

    <div class="editor-foot">
      <button
        :class="['btn', isEmpty ? 'btn-disabled' : 'btn-primary']"
        :disabled="isEmpty"
        @click="save"
        style="min-width: 96px"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M19 21H5a2 2 0 0 1-2-2V7l4-4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z" />
          <path d="M17 21v-8H7v8" />
          <path d="M7 3v4h8" />
        </svg>
        {{ saveLabel }}
      </button>
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
  grid-template-rows: auto 48px 1fr auto 56px;
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

.head-link {
  border: 0;
  background: transparent;
  color: #9d968d;
  font-size: 13px;
  padding: 0;
  cursor: pointer;
}

[data-theme="dark"] .head-link {
  color: #8d857b;
}

[data-theme="dark"] .head-link:hover {
  color: #eee8de;
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

.line-number {
  padding-top: 18px;
  text-align: center;
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

.editor-input {
  padding: 18px 16px;
  min-height: 0;
  overflow: hidden;
}

.editor-input textarea {
  width: 100%;
  height: 100%;
  min-height: 520px;
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

.editor-foot {
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 12px;
  flex: none;
}

[data-theme="dark"] .editor-foot {
  background: #26231e;
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
