<script setup lang="ts">
import { computed, toRefs } from 'vue';
import AnkiFieldMappingEditor from '@/components/AnkiExport/AnkiFieldMappingEditor.vue';
import type {
  AnkiDuplicateConflict,
  AnkiExportPayload,
  AnkiModelTemplate,
  FieldMappingConfig,
} from '@/types/anki';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:deckName', value: string): void;
  (e: 'update:modelName', value: string): void;
  (e: 'update:templateName', value: string): void;
  (e: 'update:tagsInput', value: string): void;
  (e: 'update:apkgPath', value: string): void;
  (e: 'update:fieldMapping', value: FieldMappingConfig): void;
  (e: 'connect-anki'): void;
  (e: 'browse-apkg-path'): void;
  (e: 'refresh'): void;
  (e: 'import-test'): void;
  (e: 'export-apkg'): void;
}>();

const onOverlayClick = (): void => emit('close');

const props = defineProps<{
  open: boolean;
  busy: boolean;
  error: string;
  payload: AnkiExportPayload | null;
  duplicateConflict: AnkiDuplicateConflict | null;
  ankiConnected: boolean;
  deckOptions: string[];
  modelOptions: string[];
  modelFieldNames: string[];
  templateOptions: AnkiModelTemplate[];
  deckName: string;
  modelName: string;
  templateName: string;
  tagsInput: string;
  apkgPath: string;
  fieldMapping: FieldMappingConfig;
}>();
const { open, busy, error, payload, duplicateConflict, ankiConnected } = toRefs(props);

const mappedFieldNames = computed(() => {
  if (!props.payload) return [];
  if (props.modelFieldNames.length > 0) return props.modelFieldNames;
  return Object.keys(props.payload.fields);
});
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 bg-black/40" @click="onOverlayClick" />
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="anki-modal-container w-full max-w-3xl rounded-xl bg-[var(--surface-panel)] border border-[var(--border)] shadow-xl overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
        <h3 class="text-[var(--text)] font-bold text-base">Anki Card Export</h3>
        <button
          class="w-8 h-8 rounded-full text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--surface-soft)] transition-colors"
          @click="emit('close')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm text-[var(--text-soft)]">
            <span v-if="ankiConnected" class="text-[var(--green)] font-semibold">Anki connected</span>
            <span v-else class="text-[var(--amber)] font-semibold">Anki not connected</span>
          </div>
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
            :disabled="busy"
            @click="emit('connect-anki')"
          >
            Connect / Refresh Decks
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label class="text-sm text-[var(--text)] font-medium">
            Deck Name
            <select
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="props.deckName"
              @change="emit('update:deckName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!props.deckOptions.length" :value="props.deckName">
                {{ props.deckName || '(empty)' }}
              </option>
              <option v-for="deck in props.deckOptions" :key="deck" :value="deck">
                {{ deck }}
              </option>
            </select>
          </label>

          <label class="text-sm text-[var(--text)] font-medium">
            Model Name
            <select
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="props.modelName"
              @change="emit('update:modelName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!props.modelOptions.length" :value="props.modelName">
                {{ props.modelName || '(empty)' }}
              </option>
              <option v-for="model in props.modelOptions" :key="model" :value="model">
                {{ model }}
              </option>
            </select>
          </label>

          <label class="text-sm text-[var(--text)] font-medium">
            Card Template
            <select
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="props.templateName"
              @change="emit('update:templateName', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Select template</option>
              <option
                v-for="template in props.templateOptions"
                :key="template.name"
                :value="template.name"
              >
                {{ template.name }}
              </option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <label class="text-sm text-[var(--text)] font-medium">
            Tags (comma separated)
            <input
              class="mt-1 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="props.tagsInput"
              @input="emit('update:tagsInput', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <label class="text-sm text-[var(--text)] font-medium block">
          .apkg File Name
          <div class="mt-1 flex gap-2">
            <input
              class="flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm"
              :value="props.apkgPath"
              @input="emit('update:apkgPath', ($event.target as HTMLInputElement).value)"
            />
            <button
              class="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)] text-sm"
              :disabled="busy"
              @click="emit('browse-apkg-path')"
            >
              Browse
            </button>
          </div>
        </label>

        <div class="flex justify-end">
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)]"
            :disabled="busy"
            @click="emit('refresh')"
          >
            Refresh Preview
          </button>
        </div>

        <div
          v-if="error"
          class="rounded-lg border border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red)] px-3 py-2 text-sm"
        >
          {{ error }}
        </div>

        <div
          v-if="duplicateConflict"
          class="rounded-lg border border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red)] px-3 py-3 text-sm"
        >
          <div class="font-semibold">Detected duplicate word: {{ duplicateConflict.word }}</div>
          <div class="text-xs mt-1">
            Deck: {{ duplicateConflict.deckName }} | Model: {{ duplicateConflict.modelName }} |
            NoteId:
            {{ duplicateConflict.noteId }}
          </div>
          <div class="mt-2 text-xs text-[var(--red)]">
            Duplicate detected. Overwrite will replace all fields in the existing note.
          </div>
          <div class="mt-3 flex justify-end">
            <button
              class="px-3 py-1.5 rounded-lg border border-[var(--red-border)] bg-[var(--red)] text-white text-sm hover:opacity-85"
              :disabled="busy || !payload"
              @click="emit('import-test')"
            >
              {{ busy ? 'Working...' : 'Overwrite And Import' }}
            </button>
          </div>
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
            :model-name="props.modelName"
            :model-field-names="props.modelFieldNames"
            :model-value="props.fieldMapping"
            :disabled="busy"
            @update:model-value="emit('update:fieldMapping', $event)"
          />
          <div v-if="props.payload" class="mt-4 grid grid-cols-1 gap-2 text-xs">
            <div
              v-for="fieldName in mappedFieldNames"
              :key="fieldName"
              class="bg-[var(--table-field)] border border-[var(--line)] rounded p-2 break-all"
            >
              <strong>{{ fieldName }}:</strong>
              {{
                (props.payload.fields[fieldName] || '').length > 160
                  ? `${props.payload.fields[fieldName].slice(0, 160)}...`
                  : props.payload.fields[fieldName] || '(empty)'
              }}
            </div>
          </div>
        </div>
      </div>

      <div class="px-5 py-4 border-t border-[var(--line)] flex flex-wrap justify-end gap-2">
        <button
          :class="
            duplicateConflict
              ? 'px-4 py-2 rounded-lg border border-[var(--red-border)] bg-[var(--red)] text-white hover:opacity-85 text-sm'
              : 'px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:bg-[var(--surface-soft)] text-sm'
          "
          :disabled="busy || !payload"
          @click="emit('import-test')"
        >
          {{
            busy
              ? 'Working...'
              : duplicateConflict
                ? 'Overwrite Existing Note'
                : 'Import to Selected Deck'
          }}
        </button>
        <button
          class="px-4 py-2 rounded-lg bg-[var(--blue)] hover:opacity-80 text-white text-sm disabled:opacity-50"
          :disabled="busy || !payload"
          @click="emit('export-apkg')"
        >
          {{ busy ? 'Working...' : 'Export .apkg' }}
        </button>
      </div>
    </div>
  </div>
</template>
