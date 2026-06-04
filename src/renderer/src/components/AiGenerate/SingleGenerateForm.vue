<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  running: boolean;
  queuedPosition?: number;
  revisionMode: boolean;
  notes: string;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [payload: { word: string; context?: string; notes?: string }];
  'update-notes': [notes: string];
}>();

const word = ref('');
const context = ref('');

const canStart = computed(() => word.value.trim().length > 0);
const notesLabel = computed(() => (props.revisionMode ? 'Revision notes' : 'Generation notes'));
const notesBadge = computed(() => (props.revisionMode ? 'Regenerate / Improve Text' : 'Generate'));
const notesPlaceholder = computed(() =>
  props.revisionMode
    ? 'Add extra feedback for the next revision...'
    : 'Optional hints, constraints, or examples...'
);
const notesHelp = computed(() =>
  props.revisionMode
    ? 'Applied to stage regeneration and text quality improvement for the selected job.'
    : 'Applied when starting a new single generation.'
);

function handleSubmit(): void {
  const normalized = word.value.trim();
  if (!normalized) return;
  emit('submit', {
    word: normalized,
    context: context.value.trim() || undefined,
    notes: props.notes.trim() || undefined,
  });
  word.value = '';
  context.value = '';
  emit('update-notes', '');
}
</script>

<template>
  <section class="input-grid">
    <label>
      <span>Word</span>
      <input
        :value="word"
        type="text"
        placeholder="Enter the word to analyze"
        @input="word = ($event.target as HTMLInputElement).value"
        @keyup.enter="handleSubmit"
      />
    </label>
    <label>
      <span>Context</span>
      <input
        :value="context"
        type="text"
        placeholder="Add the word's sentence or context"
        @input="context = ($event.target as HTMLInputElement).value"
      />
    </label>
    <label class="notes-field" :class="{ 'is-revision': revisionMode }">
      <span class="field-label-row">
        <span>{{ notesLabel }}</span>
        <span class="field-badge">{{ notesBadge }}</span>
      </span>
      <textarea
        :value="notes"
        class="notes-input"
        rows="2"
        :placeholder="notesPlaceholder"
        @input="emit('update-notes', ($event.target as HTMLTextAreaElement).value)"
      />
      <small class="field-help">{{ notesHelp }}</small>
    </label>
  </section>

  <div class="action-row" data-tour="ai-generate-submit">
    <button
      type="button"
      class="ui-button ui-button--primary drawer-button"
      :disabled="!canStart"
      @click="handleSubmit"
    >
      Generate
    </button>
    <button
      v-if="running"
      type="button"
      class="ui-button ui-button--danger drawer-button"
      @click="emit('cancel')"
    >
      Cancel selected
    </button>
    <span v-if="queuedPosition" class="queue-pill">
      Queued {{ queuedPosition }}
    </span>
  </div>
</template>

<style scoped>
.input-grid {
  display: grid;
  gap: 10px;
}

.input-grid label {
  display: grid;
  gap: 5px;
}

.input-grid span {
  color: var(--muted);
  font-size: 12px;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-badge {
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--muted);
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.notes-field.is-revision .field-badge {
  border-color: var(--green-border);
  background: var(--green-soft);
  color: var(--green);
}

.input-grid input,
.input-grid textarea {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--editor-field);
  color: var(--text);
  padding: 0 10px;
  font-size: 13px;
  outline: 0;
}

.input-grid textarea {
  min-height: 58px;
  height: auto;
  resize: vertical;
  line-height: 1.45;
  padding-top: 8px;
  padding-bottom: 8px;
}

.input-grid input:focus,
.input-grid textarea:focus {
  border-color: var(--green-border);
  box-shadow: 0 0 0 2px var(--green-soft);
}

.field-help {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
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

.queue-pill {
  border: 1px solid var(--amber);
  border-radius: var(--radius-full);
  padding: 4px 8px;
  color: var(--amber);
  font-size: 12px;
}
</style>
