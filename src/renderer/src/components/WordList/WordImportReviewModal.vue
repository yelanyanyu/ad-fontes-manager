<script setup lang="ts">
import { computed, ref } from 'vue';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';
import type { WordImportConflict, WordImportConflictAction } from '@/services/wordImportService';

const props = defineProps<{
  open: boolean;
  conflicts: WordImportConflict[];
  busy: boolean;
  importedCount: number;
  failedCount: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'set-action', key: string, action: WordImportConflictAction): void;
  (e: 'resolve'): void;
  (e: 'resolve-mode', action: WordImportConflictAction): void;
}>();

const previewKey = ref<string | null>(null);

const previewConflict = computed(
  () => props.conflicts.find(conflict => conflict.key === previewKey.value) || null
);
const overwriteCount = computed(
  () => props.conflicts.filter(conflict => conflict.action === 'overwrite').length
);
const skipCount = computed(() => props.conflicts.length - overwriteCount.value);

const markPreviewOverwrite = (): void => {
  if (!previewConflict.value) return;
  emit('set-action', previewConflict.value.key, 'overwrite');
  previewKey.value = null;
};
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="word-import-backdrop" role="dialog" aria-modal="true">
      <section class="word-import-modal">
        <header class="word-import-head">
          <div>
            <h2>Review Word Import Conflicts</h2>
            <p>
              Imported {{ importedCount }} new words. {{ conflicts.length }} existing words need a decision.
            </p>
          </div>
          <button class="icon-close" type="button" aria-label="Close" :disabled="busy" @click="emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <div class="word-import-summary">
          <span>Skip {{ skipCount }}</span>
          <span>Overwrite {{ overwriteCount }}</span>
          <span v-if="failedCount">Failed {{ failedCount }}</span>
        </div>

        <div class="word-import-actions">
          <button class="secondary-action" type="button" :disabled="busy" @click="emit('resolve-mode', 'skip')">
            Import new only
          </button>
          <button class="danger-action" type="button" :disabled="busy" @click="emit('resolve-mode', 'overwrite')">
            Overwrite conflicts and import all
          </button>
        </div>

        <div class="word-import-list">
          <article v-for="conflict in conflicts" :key="conflict.key" class="word-import-row">
            <div class="word-import-word">
              <strong>{{ conflict.lemma }}</strong>
              <span>{{ conflict.language }}</span>
            </div>
            <div class="word-import-choice">
              <label>
                <input
                  type="radio"
                  :name="`word-import-${conflict.key}`"
                  value="skip"
                  :checked="conflict.action === 'skip'"
                  :disabled="busy"
                  @change="emit('set-action', conflict.key, 'skip')"
                />
                Skip
              </label>
              <label>
                <input
                  type="radio"
                  :name="`word-import-${conflict.key}`"
                  value="overwrite"
                  :checked="conflict.action === 'overwrite'"
                  :disabled="busy"
                  @change="emit('set-action', conflict.key, 'overwrite')"
                />
                Overwrite
              </label>
            </div>
            <button class="preview-action" type="button" :disabled="busy" @click="previewKey = conflict.key">
              Preview
            </button>
          </article>
        </div>

        <footer class="word-import-foot">
          <button class="secondary-action" type="button" :disabled="busy" @click="emit('close')">Cancel</button>
          <button class="primary-action" type="button" :disabled="busy" @click="emit('resolve')">
            {{ busy ? 'Importing...' : 'Apply Decisions' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>

  <ConflictModal
    :open="!!previewConflict"
    title="Word Import Conflict"
    :subtitle="previewConflict ? `${previewConflict.lemma} (${previewConflict.language})` : ''"
    :diff="previewConflict?.diff || []"
    :left-data="previewConflict?.oldData || {}"
    :right-data="previewConflict?.newData || {}"
    left-label="Existing"
    right-label="Import"
    primary-label="Mark Overwrite"
    secondary-label="Close"
    :busy="busy"
    :formatter="yamlFormatter"
    :diff-adapter="deepDiffAdapter"
    @close="previewKey = null"
    @secondary="previewKey = null"
    @primary="markPreviewOverwrite"
  />
</template>

<style scoped>
.word-import-backdrop {
  position: fixed;
  inset: 0;
  z-index: 38;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.42);
}

.word-import-modal {
  width: min(760px, 100%);
  max-height: min(720px, calc(100vh - 32px));
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-panel);
  box-shadow: var(--shadow-md);
  color: var(--text);
}

.word-import-head,
.word-import-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}

.word-import-head h2 {
  margin: 0;
  font-size: 15px;
}

.word-import-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.icon-close {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
}

.icon-close svg {
  width: 15px;
  height: 15px;
  stroke-width: 2.2;
}

.word-import-summary,
.word-import-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}

.word-import-summary span {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  background: var(--surface-soft);
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 650;
}

.word-import-list {
  overflow: auto;
}

.word-import-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}

.word-import-word {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.word-import-word strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.word-import-word span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.word-import-choice {
  display: flex;
  gap: 10px;
  color: var(--text-soft);
  font-size: 12px;
}

.word-import-choice label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.secondary-action,
.preview-action,
.primary-action,
.danger-action {
  height: 30px;
  border-radius: var(--radius-sm);
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
}

.secondary-action,
.preview-action {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-soft);
}

.primary-action {
  border: 1px solid var(--green-border);
  background: var(--green);
  color: #fff;
}

.danger-action {
  border: 1px solid var(--red-border);
  background: var(--red-soft);
  color: var(--red);
}

.word-import-foot {
  justify-content: flex-end;
  border-top: 1px solid var(--line);
  border-bottom: 0;
}

button:disabled {
  cursor: wait;
  opacity: 0.64;
}
</style>
