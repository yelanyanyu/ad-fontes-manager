<script setup lang="ts">
import { computed } from 'vue';
import AnkiFieldMappingEditor from '@/components/AnkiExport/AnkiFieldMappingEditor.vue';
import type {
  AnkiModelTemplate,
  BatchAnkiExportItem,
  BatchAnkiProgress,
  FieldMappingConfig,
} from '@/types/anki';

const props = defineProps<{
  open: boolean;
  busy: boolean;
  error: string;
  items: BatchAnkiExportItem[];
  progress: BatchAnkiProgress;
  progressLabel: string;
  ankiConnected: boolean;
  deckOptions: string[];
  modelOptions: string[];
  modelFieldNames: string[];
  templateOptions: AnkiModelTemplate[];
  deckName: string;
  modelName: string;
  templateName: string;
  tagsInput: string;
  fieldMapping: FieldMappingConfig;
  canEditConfig: boolean;
  canCancel: boolean;
  canResume: boolean;
  lastStoppedPhase: 'check' | 'import' | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'return'): void;
  (e: 'update:deckName', value: string): void;
  (e: 'update:modelName', value: string): void;
  (e: 'update:templateName', value: string): void;
  (e: 'update:tagsInput', value: string): void;
  (e: 'update:fieldMapping', value: FieldMappingConfig): void;
  (e: 'connect-anki'): void;
  (e: 'check-duplicates'): void;
  (e: 'ignore-all-duplicates'): void;
  (e: 'overwrite-all-duplicates'): void;
  (e: 'import-ready-items'): void;
  (e: 'export-apkg'): void;
  (e: 'cancel-operation'): void;
  (e: 'resume-operation'): void;
  (e: 'restart-operation'): void;
  (e: 'preview-word', wordId: string): void;
}>();

const onOverlayClick = (): void => emit('return');

const statusClassMap: Record<string, string> = {
  pending: 'bg-[var(--surface-soft)] text-[var(--muted)] border-[var(--border)]',
  checking: 'bg-[var(--blue-soft)] text-[var(--blue)] border-[var(--blue-border)]',
  duplicate: 'bg-[var(--amber-soft)] text-[var(--amber)] border-[var(--amber-border)]',
  ready: 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green-border)]',
  importing: 'bg-[var(--blue-soft)] text-[var(--blue)] border-[var(--blue-border)]',
  imported: 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green-border)]',
  skipped: 'bg-[var(--surface-soft)] text-[var(--muted)] border-[var(--border)]',
  overwritten: 'bg-[var(--amber-soft)] text-[var(--amber)] border-[var(--amber-border)]',
  failed: 'bg-[var(--red-soft)] text-[var(--red)] border-[var(--red-border)]',
};

const hasResolvedDuplicates = computed(() =>
  props.items.some(item => item.status === 'duplicate' && item.conflict)
);

const duplicateResolutionLabel = (item: BatchAnkiExportItem): string => {
  if (item.status !== 'duplicate' || !item.conflict) return '';
  if (item.resolution === 'overwrite') return 'Overwrite selected';
  if (item.resolution === 'skip') return 'Skip selected';
  return 'Needs action';
};
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 bg-black/40" @click="onOverlayClick" />
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="anki-modal-container w-full max-w-6xl h-[90vh] rounded-xl bg-[var(--surface-panel)] border border-[var(--border)] shadow-xl overflow-hidden flex flex-col"
    >
      <div class="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
        <h3 class="text-[var(--text)] font-bold text-base">Batch Anki Card Operations</h3>
        <div class="flex items-center gap-2">
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
            @click="emit('return')"
          >
            Back to List
          </button>
          <button
            class="w-8 h-8 rounded-full text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--surface-soft)] transition-colors"
            @click="emit('close')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto min-h-0">
        <div class="p-5 border-b border-[var(--line)] space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm text-[var(--text-soft)]">
            <span v-if="ankiConnected" class="text-[var(--green)] font-semibold">Anki connected</span>
            <span v-else class="text-[var(--amber)] font-semibold">Anki not connected</span>
            <span class="ml-3 text-[var(--muted)]">{{ items.length }} words selected</span>
          </div>
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
            :disabled="busy"
            @click="emit('connect-anki')"
          >
            Connect / Refresh Decks
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label class="text-sm text-[var(--text)] font-medium">
            Deck Name
            <select
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="deckName"
              :disabled="!canEditConfig"
              @change="emit('update:deckName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!deckOptions.length" :value="deckName">
                {{ deckName || '(empty)' }}
              </option>
              <option v-for="deck in deckOptions" :key="deck" :value="deck">{{ deck }}</option>
            </select>
          </label>
          <label class="text-sm text-[var(--text)] font-medium">
            Model Name
            <select
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="modelName"
              :disabled="!canEditConfig"
              @change="emit('update:modelName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!modelOptions.length" :value="modelName">
                {{ modelName || '(empty)' }}
              </option>
              <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
          <label class="text-sm text-[var(--text)] font-medium">
            Card Template
            <select
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="templateName"
              :disabled="!canEditConfig"
              @change="emit('update:templateName', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Select template</option>
              <option
                v-for="template in templateOptions"
                :key="template.name"
                :value="template.name"
              >
                {{ template.name }}
              </option>
            </select>
          </label>
          <label class="text-sm text-[var(--text)] font-medium">
            Tags (comma separated)
            <input
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="tagsInput"
              :disabled="!canEditConfig"
              @input="emit('update:tagsInput', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <div class="rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-4">
          <div
            v-if="!ankiConnected"
            class="rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)] px-3 py-2 text-sm"
          >
            Please connect Anki before configuring field mapping.
          </div>
          <AnkiFieldMappingEditor
            v-else
            :model-name="modelName"
            :model-field-names="modelFieldNames"
            :model-value="fieldMapping"
            :disabled="!canEditConfig"
            @update:model-value="emit('update:fieldMapping', $event)"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] text-sm hover:bg-[var(--surface-soft)]"
            :disabled="busy || !items.length || !canEditConfig"
            @click="emit('check-duplicates')"
          >
            Check Duplicates
          </button>
          <button
            class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] text-sm hover:bg-[var(--surface-soft)]"
            :disabled="busy || !hasResolvedDuplicates"
            @click="emit('ignore-all-duplicates')"
          >
            Mark Duplicates to Skip
          </button>
          <button
            class="px-3 py-1.5 rounded-lg border border-[var(--amber-border)] bg-[var(--surface)] text-[var(--amber)] text-sm hover:bg-[var(--amber-soft)]"
            :disabled="busy || !hasResolvedDuplicates"
            @click="emit('overwrite-all-duplicates')"
          >
            Mark Duplicates to Overwrite
          </button>
          <button
            class="px-3 py-1.5 rounded-lg bg-[var(--blue)] text-white text-sm hover:opacity-85 disabled:opacity-50"
            :disabled="busy || !items.length"
            @click="emit('export-apkg')"
          >
            Export Selected as .apkg
          </button>
          <button
            class="px-3 py-1.5 rounded-lg bg-[var(--green)] text-white text-sm hover:bg-[var(--green-hover)] disabled:opacity-50"
            :disabled="busy || !items.length"
            @click="emit('import-ready-items')"
          >
            Apply Import Plan
          </button>
          <button
            v-if="canCancel"
            class="px-3 py-1.5 rounded-lg border border-[var(--red-border)] bg-[var(--surface)] text-[var(--red)] text-sm hover:bg-[var(--red-soft)]"
            @click="emit('cancel-operation')"
          >
            Cancel Batch Operation
          </button>
          <button
            v-if="canResume"
            class="px-3 py-1.5 rounded-lg border border-[var(--blue-border)] bg-[var(--surface)] text-[var(--blue)] text-sm hover:bg-[var(--blue-soft)]"
            :disabled="busy"
            @click="emit('resume-operation')"
          >
            Resume
          </button>
          <button
            v-if="canResume"
            class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] text-sm hover:bg-[var(--surface-soft)]"
            :disabled="busy"
            @click="emit('restart-operation')"
          >
            Restart
          </button>
        </div>

        <div v-if="canResume && lastStoppedPhase" class="text-xs text-[var(--amber)]">
          Batch operation was cancelled during {{ lastStoppedPhase }}.
        </div>

        <div v-if="progress.total > 0" class="space-y-2">
          <div class="text-xs text-[var(--muted)] font-medium">{{ progressLabel }}</div>
          <div class="w-full h-2 rounded-full bg-[var(--surface-soft)] overflow-hidden">
            <div
              class="h-full bg-[var(--blue)] transition-all duration-300"
              :style="{ width: `${progress.percent}%` }"
            />
          </div>
        </div>

        <div
          v-if="error"
          class="rounded-lg border border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red)] px-3 py-2 text-sm"
        >
          {{ error }}
        </div>
      </div>

      <div>
        <table class="min-w-full bg-[var(--table-field)]">
          <thead class="bg-[var(--surface-head)] sticky top-0">
            <tr>
              <th
                class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold"
              >
                Lemma
              </th>
              <th
                class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold"
              >
                Source
              </th>
              <th
                class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold"
              >
                Status
              </th>
              <th
                class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold"
              >
                Details
              </th>
              <th
                class="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold"
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[var(--line)]">
            <tr v-for="item in items" :key="item.key" class="hover:bg-[var(--surface-soft)]">
              <td class="px-4 py-3 text-sm font-semibold text-[var(--text)]">{{ item.lemma }}</td>
              <td class="px-4 py-3 text-xs text-[var(--muted)]">
                <span
                  :class="
                    item.record.isLocal
                      ? 'inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--surface-soft)] text-[var(--muted)] border border-[var(--border)]'
                      : 'inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--blue-soft)] text-[var(--blue)] border border-[var(--blue-border)]'
                  "
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>
                  DB
                </span>
              </td>
              <td class="px-4 py-3 text-xs">
                <span
                  class="inline-flex items-center px-2 py-1 rounded-full border font-semibold"
                  :class="statusClassMap[item.status] || statusClassMap.pending"
                >
                  {{ item.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs text-[var(--muted)]">
                <span v-if="item.conflict">
                  Duplicate noteId: {{ item.conflict.noteId }}
                  <span
                    class="ml-2 inline-flex items-center rounded border px-1.5 py-0.5 font-semibold"
                    :class="
                      item.resolution === 'overwrite'
                        ? 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]'
                        : item.resolution === 'skip'
                          ? 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--muted)]'
                          : 'border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red)]'
                    "
                  >
                    {{ duplicateResolutionLabel(item) }}
                  </span>
                </span>
                <span v-else-if="item.noteId">NoteId: {{ item.noteId }}</span>
                <span v-else-if="item.error" class="text-[var(--red)]">{{ item.error }}</span>
                <span v-else>-</span>
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  class="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
                  @click="emit('preview-word', item.id)"
                >
                  Preview HTML
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.anki-modal-container input:focus,
.anki-modal-container select:focus,
.anki-modal-container textarea:focus {
  border-color: var(--green-border) !important;
  box-shadow: 0 0 0 3px rgba(36, 114, 83, 0.08) !important;
}
[data-theme="dark"] .anki-modal-container input:focus,
[data-theme="dark"] .anki-modal-container select:focus,
[data-theme="dark"] .anki-modal-container textarea:focus {
  box-shadow: 0 0 0 3px rgba(67, 179, 127, 0.1) !important;
}
</style>
