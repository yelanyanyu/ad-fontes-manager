<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import type { Ref } from 'vue';
import yaml from 'js-yaml';
import { useWordStore } from '@/stores/wordStore';
import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import CurrentSchemaReference from '@/components/WordEditor/CurrentSchemaReference.vue';
import YamlEditorSurface from '@/components/WordEditor/YamlEditorSurface.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import type { ConflictData } from '@/types/word-editor';
import request from '@/utils/request';
import { useYamlHierarchy } from '@/composables/useYamlHierarchy';
import { createWordEditorValidationController } from '@/modules/wordEditor/validationController';
import { createFormatFixCommand } from '@/modules/wordEditor/formatFixCommand';
import { createWordEditorSession } from '@/modules/wordEditor/session';
import { hideWordAppMetadataInYaml } from '@/utils/wordMetadata';
import { useOverlayStack } from '@/composables/useOverlayStack';

interface WordStoreLike {
  editorSession: {
    yaml: string;
    reloadToken: number;
    context: {
      id?: string | number | null;
      wordSchemaVersion?: number | null;
      isLatestSchema?: boolean | null;
    };
  };
  saveWord: (yamlContent: string, force?: boolean) => Promise<boolean | ConflictData>;
  updateEditorSessionContext: (context: { id: string | number | null }) => void;
}

interface AppStoreLike {
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const wordStore = useWordStore() as unknown as WordStoreLike;
const appStore = useAppStore() as unknown as AppStoreLike;

const { editorSession } = storeToRefs(wordStore as any) as {
  editorSession: Ref<WordStoreLike['editorSession']>;
};

const session = createWordEditorSession();
const input = session.currentYaml;
const editorSurfaceRef = ref<InstanceType<typeof YamlEditorSurface> | null>(null);
const moreMenuRef = ref<HTMLElement | null>(null);
const cursorPos = ref(0);
const conflictData = ref<ConflictData | null>(null);
const saving = ref(false);
const moreMenuOpen = ref(false);
const schemaReferenceOpen = ref(false);
const schemaReferenceStack = useOverlayStack('schema-reference');

const { breadcrumbPath, lineDepths, cursorLine } = useYamlHierarchy(input, cursorPos);
const validationController = createWordEditorValidationController({
  validateYaml: payload => request.post('/v2/words/validate', payload),
  getIntent: () => session.validationContext.value.intent,
  getWordId: () => session.validationContext.value.wordId,
  getBaseWordSchemaVersion: () => session.validationContext.value.baseWordSchemaVersion,
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

const isEmpty = computed(() => !input.value || input.value.trim().length === 0);
const editorSaveIntentLabel = computed(() =>
  session.mode.value === 'update' ? 'Editing Word' : 'New Word'
);
const editorSchemaFreshness = computed(
  () =>
    (validationState.schemaFreshness === 'future' ? 'future' : session.displayFreshness.value) ||
    (validationState.schemaFreshness === 'old' ? 'old' : null)
);

const saveLabel = 'Save';

function closeMoreMenuOnOutsideClick(event: MouseEvent): void {
  const menu = moreMenuRef.value;
  if (!menu || menu.contains(event.target as Node)) return;
  moreMenuOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', closeMoreMenuOnOutsideClick);
});

onUnmounted(() => {
  document.removeEventListener('click', closeMoreMenuOnOutsideClick);
  schemaReferenceStack.remove();
  validationController.dispose();
});

watch(
  input,
  () => {
    validationController.handleTextChanged(input.value);
  },
  { flush: 'post' }
);

watch(
  () => editorSession.value.reloadToken,
  () => {
    if (typeof editorSession.value.yaml === 'string') {
      const context = editorSession.value.context || {};
      if (context.id) {
        session.loadExistingWord(editorSession.value.yaml, {
          id: context.id,
          wordSchemaVersion: context.wordSchemaVersion ?? null,
          isLatestSchema: context.isLatestSchema ?? null,
        });
      } else {
        session.loadNewWord(editorSession.value.yaml);
      }
      cursorPos.value = 0;
      void nextTick(() => editorSurfaceRef.value?.scheduleLineMeasure());
    }
  },
  { immediate: true }
);

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
  void nextTick(() => editorSurfaceRef.value?.focus());
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
    wordStore.updateEditorSessionContext({ id: conflictData.value.id });
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
      void nextTick(() => editorSurfaceRef.value?.focus());
    }
  } finally {
    saving.value = false;
  }
};

const applyGeneratedYaml = (yamlContent: string) => {
  input.value = hideWordAppMetadataInYaml(yamlContent);
};

const openSchemaReference = () => {
  schemaReferenceOpen.value = true;
  schemaReferenceStack.bringToFront();
  moreMenuOpen.value = false;
};

const closeSchemaReference = () => {
  schemaReferenceOpen.value = false;
  schemaReferenceStack.remove();
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
          <span v-if="editorSchemaFreshness === 'old'" class="editor-freshness-chip">
            旧
          </span>
          <span v-if="editorSchemaFreshness === 'future'" class="editor-freshness-chip">
            新版
          </span>
        </span>
      </div>
      <div class="head-actions">
        <div ref="moreMenuRef" class="editor-more">
          <button
            class="ui-icon-button"
            type="button"
            title="More"
            aria-label="More editor actions"
            aria-haspopup="menu"
            :aria-expanded="moreMenuOpen"
            @click.stop="moreMenuOpen = !moreMenuOpen"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          <div v-if="moreMenuOpen" class="editor-more-menu" role="menu">
            <button type="button" role="menuitem" @click="openSchemaReference">
              Current Schema Reference
            </button>
          </div>
        </div>
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

    <div class="editor-body">
      <YamlEditorSurface
        ref="editorSurfaceRef"
        v-model="input"
        :line-depths="lineDepths"
        :cursor-line="cursorLine"
        :readonly="saving"
        @cursor-change="cursorPos = $event"
      />
    </div>

    <Teleport to="[data-tour='word-list']" defer>
      <CurrentSchemaReference
        v-if="schemaReferenceOpen"
        :style="{ zIndex: schemaReferenceStack.zIndex.value }"
        @pointerdown="schemaReferenceStack.bringToFront"
        @close="closeSchemaReference"
      />
    </Teleport>

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

.editor-more {
  position: relative;
}

.editor-more-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  min-width: 210px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.editor-more-menu button {
  width: 100%;
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.editor-more-menu button:hover,
.editor-more-menu button:focus-visible {
  background: var(--green-soft);
  color: var(--green);
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

.editor-body {
  position: relative;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
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
