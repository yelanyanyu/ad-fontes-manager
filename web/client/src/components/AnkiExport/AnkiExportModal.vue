<script setup lang="ts">
import type { AnkiDuplicateConflict, AnkiExportPayload } from '@/types/anki';

defineProps<{
  open: boolean;
  busy: boolean;
  error: string;
  payload: AnkiExportPayload | null;
  duplicateConflict: AnkiDuplicateConflict | null;
  ankiConnected: boolean;
  deckOptions: string[];
  modelOptions: string[];
  deckName: string;
  modelName: string;
  addReverse: boolean;
  tagsInput: string;
  apkgPath: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:deckName', value: string): void;
  (e: 'update:modelName', value: string): void;
  (e: 'update:addReverse', value: boolean): void;
  (e: 'update:tagsInput', value: string): void;
  (e: 'update:apkgPath', value: string): void;
  (e: 'connect-anki'): void;
  (e: 'browse-apkg-path'): void;
  (e: 'refresh'): void;
  (e: 'import-test'): void;
  (e: 'export-apkg'): void;
}>();

const onOverlayClick = (): void => emit('close');
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 bg-black/40" @click="onOverlayClick" />
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      class="w-full max-w-3xl rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="text-slate-800 font-bold text-base">Export to Anki</h3>
        <button
          class="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          @click="emit('close')"
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>

      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm text-slate-600">
            <span v-if="ankiConnected" class="text-emerald-600 font-semibold">Anki connected</span>
            <span v-else class="text-amber-600 font-semibold">Anki not connected</span>
          </div>
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            :disabled="busy"
            @click="emit('connect-anki')"
          >
            Connect / Refresh Decks
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="text-sm text-slate-700 font-medium">
            Deck Name
            <select
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              :value="deckName"
              @change="emit('update:deckName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!deckOptions.length" :value="deckName">
                {{ deckName || '(empty)' }}
              </option>
              <option v-for="deck in deckOptions" :key="deck" :value="deck">{{ deck }}</option>
            </select>
          </label>

          <label class="text-sm text-slate-700 font-medium">
            Model Name
            <select
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              :value="modelName"
              @change="emit('update:modelName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!modelOptions.length" :value="modelName">
                {{ modelName || '(empty)' }}
              </option>
              <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="text-sm text-slate-700 font-medium">
            Tags (comma separated)
            <input
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              :value="tagsInput"
              @input="emit('update:tagsInput', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-700 font-medium pt-7">
            <input
              type="checkbox"
              class="rounded border-slate-300"
              :checked="addReverse"
              @change="emit('update:addReverse', ($event.target as HTMLInputElement).checked)"
            />
            <span>Add Reverse Card</span>
          </label>
        </div>

        <label class="text-sm text-slate-700 font-medium block">
          .apkg Output Path (AnkiConnect)
          <div class="mt-1 flex gap-2">
            <input
              class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              :value="apkgPath"
              @input="emit('update:apkgPath', ($event.target as HTMLInputElement).value)"
            />
            <button
              class="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm"
              :disabled="busy"
              @click="emit('browse-apkg-path')"
            >
              Browse
            </button>
          </div>
        </label>

        <div class="flex justify-end">
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
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

        <div v-if="payload" class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 class="font-bold text-slate-700 text-sm mb-3">Target Fields Preview</h4>
          <div class="grid grid-cols-1 gap-2 text-xs">
            <div class="bg-white border border-slate-200 rounded p-2">
              <strong>Word:</strong> {{ payload.fields.Word }}
            </div>
            <div class="bg-white border border-slate-200 rounded p-2">
              <strong>Context:</strong> {{ payload.fields.Context }}
            </div>
            <div class="bg-white border border-slate-200 rounded p-2">
              <strong>notes:</strong> {{ payload.fields.notes }}
            </div>
            <div class="bg-white border border-slate-200 rounded p-2 break-all">
              <strong>Back:</strong> {{ payload.fields.Back.slice(0, 240) }}...
            </div>
            <div class="bg-white border border-slate-200 rounded p-2">
              <strong>Add Reverse:</strong> {{ payload.fields['Add Reverse'] || '(empty)' }}
            </div>
            <div class="bg-white border border-slate-200 rounded p-2">
              <strong>Media:</strong> {{ payload.fields.Media || '(empty)' }}
            </div>
          </div>
        </div>
      </div>

      <div class="px-5 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
        <button
          :class="
            duplicateConflict
              ? 'px-4 py-2 rounded-lg border border-red-300 bg-red-600 text-white hover:bg-red-500 text-sm'
              : 'px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm'
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
          {{ busy ? 'Working...' : 'Export .apkg via AnkiConnect' }}
        </button>
      </div>
    </div>
  </div>
</template>
