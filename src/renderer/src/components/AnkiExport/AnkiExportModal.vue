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
      class="w-full max-w-3xl rounded-xl bg-white border border-emerald-100 shadow-xl overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-emerald-50 flex items-center justify-between">
        <h3 class="text-slate-800 font-bold text-base">Anki Card Export</h3>
        <button
          class="w-8 h-8 rounded-full text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
          @click="emit('close')"
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>

      <div class="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm text-slate-600">
            <span v-if="ankiConnected" class="text-emerald-600 font-semibold">Anki connected</span>
            <span v-else class="text-amber-600 font-semibold">Anki not connected</span>
          </div>
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-emerald-100 text-slate-700 hover:bg-emerald-50"
            :disabled="busy"
            @click="emit('connect-anki')"
          >
            Connect / Refresh Decks
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label class="text-sm text-slate-700 font-medium">
            Deck Name
            <select
              class="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2 text-sm"
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

          <label class="text-sm text-slate-700 font-medium">
            Model Name
            <select
              class="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2 text-sm"
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

          <label class="text-sm text-slate-700 font-medium">
            Card Template
            <select
              class="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2 text-sm"
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
          <label class="text-sm text-slate-700 font-medium">
            Tags (comma separated)
            <input
              class="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2 text-sm"
              :value="props.tagsInput"
              @input="emit('update:tagsInput', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <label class="text-sm text-slate-700 font-medium block">
          .apkg File Name
          <div class="mt-1 flex gap-2">
            <input
              class="flex-1 rounded-lg border border-emerald-300 px-3 py-2 text-sm"
              :value="props.apkgPath"
              @input="emit('update:apkgPath', ($event.target as HTMLInputElement).value)"
            />
            <button
              class="px-3 py-2 rounded-lg border border-emerald-100 text-slate-700 hover:bg-emerald-50 text-sm"
              :disabled="busy"
              @click="emit('browse-apkg-path')"
            >
              Browse
            </button>
          </div>
        </label>

        <div class="flex justify-end">
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-emerald-100 text-slate-700 hover:bg-emerald-50"
            :disabled="busy"
            @click="emit('refresh')"
          >
            Refresh Preview
          </button>
        </div>

        <div
          v-if="error"
          class="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm"
        >
          {{ error }}
        </div>

        <div
          v-if="duplicateConflict"
          class="rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-3 text-sm"
        >
          <div class="font-semibold">Detected duplicate word: {{ duplicateConflict.word }}</div>
          <div class="text-xs mt-1">
            Deck: {{ duplicateConflict.deckName }} | Model: {{ duplicateConflict.modelName }} |
            NoteId:
            {{ duplicateConflict.noteId }}
          </div>
          <div class="mt-2 text-xs text-red-700">
            Duplicate detected. Overwrite will replace all fields in the existing note.
          </div>
          <div class="mt-3 flex justify-end">
            <button
              class="px-3 py-1.5 rounded-lg border border-red-300 bg-red-600 text-white text-sm hover:bg-red-500"
              :disabled="busy || !payload"
              @click="emit('import-test')"
            >
              {{ busy ? 'Working...' : 'Overwrite And Import' }}
            </button>
          </div>
        </div>

        <div class="rounded-lg border border-emerald-100 bg-stone-50 p-4">
          <div
            v-if="!ankiConnected"
            class="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm"
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
              class="bg-white border border-emerald-100 rounded p-2 break-all"
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

      <div class="px-5 py-4 border-t border-emerald-50 flex flex-wrap justify-end gap-2">
        <button
          :class="
            duplicateConflict
              ? 'px-4 py-2 rounded-lg border border-red-300 bg-red-600 text-white hover:bg-red-500 text-sm'
              : 'px-4 py-2 rounded-lg border border-emerald-100 text-slate-700 hover:bg-emerald-50 text-sm'
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
          class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:bg-blue-300"
          :disabled="busy || !payload"
          @click="emit('export-apkg')"
        >
          {{ busy ? 'Working...' : 'Export .apkg' }}
        </button>
      </div>
    </div>
  </div>
</template>
