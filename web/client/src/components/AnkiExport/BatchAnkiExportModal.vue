<script setup lang="ts">
import type { BatchAnkiExportItem, BatchAnkiProgress } from '@/types/anki';

defineProps<{
  open: boolean;
  busy: boolean;
  error: string;
  items: BatchAnkiExportItem[];
  progress: BatchAnkiProgress;
  progressLabel: string;
  ankiConnected: boolean;
  deckOptions: string[];
  modelOptions: string[];
  deckName: string;
  modelName: string;
  addReverse: boolean;
  tagsInput: string;
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
  (e: 'update:addReverse', value: boolean): void;
  (e: 'update:tagsInput', value: string): void;
  (e: 'connect-anki'): void;
  (e: 'check-duplicates'): void;
  (e: 'ignore-all-duplicates'): void;
  (e: 'overwrite-all-duplicates'): void;
  (e: 'import-ready-items'): void;
  (e: 'cancel-operation'): void;
  (e: 'resume-operation'): void;
  (e: 'restart-operation'): void;
  (e: 'preview-word', wordId: string): void;
}>();

const onOverlayClick = (): void => emit('return');

const statusClassMap: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  checking: 'bg-blue-50 text-blue-700 border-blue-200',
  duplicate: 'bg-amber-50 text-amber-700 border-amber-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  importing: 'bg-blue-50 text-blue-700 border-blue-200',
  imported: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  skipped: 'bg-slate-100 text-slate-600 border-slate-200',
  overwritten: 'bg-orange-50 text-orange-700 border-orange-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 bg-black/40" @click="onOverlayClick" />
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="w-full max-w-6xl h-[90vh] rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="text-slate-800 font-bold text-base">Batch Export to Anki</h3>
        <div class="flex items-center gap-2">
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            @click="emit('return')"
          >
            Back to List
          </button>
          <button
            class="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            @click="emit('close')"
          >
            <i class="fa-solid fa-xmark" />
          </button>
        </div>
      </div>

      <div class="p-5 border-b border-slate-100 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm text-slate-600">
            <span v-if="ankiConnected" class="text-emerald-600 font-semibold">Anki connected</span>
            <span v-else class="text-amber-600 font-semibold">Anki not connected</span>
            <span class="ml-3 text-slate-500">{{ items.length }} words selected</span>
          </div>
          <button
            class="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
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
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              :value="deckName"
              :disabled="!canEditConfig"
              @change="emit('update:deckName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!deckOptions.length" :value="deckName">{{ deckName || '(empty)' }}</option>
              <option v-for="deck in deckOptions" :key="deck" :value="deck">{{ deck }}</option>
            </select>
          </label>
          <label class="text-sm text-slate-700 font-medium">
            Model Name
            <select
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              :value="modelName"
              :disabled="!canEditConfig"
              @change="emit('update:modelName', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!modelOptions.length" :value="modelName">{{ modelName || '(empty)' }}</option>
              <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
          <label class="text-sm text-slate-700 font-medium">
            Tags (comma separated)
            <input
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              :value="tagsInput"
              :disabled="!canEditConfig"
              @input="emit('update:tagsInput', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-700 font-medium">
          <input
            type="checkbox"
            class="rounded border-slate-300"
            :checked="addReverse"
            :disabled="!canEditConfig"
            @change="emit('update:addReverse', ($event.target as HTMLInputElement).checked)"
          />
          <span>Add Reverse Card</span>
        </label>

        <div class="flex flex-wrap gap-2">
          <button
            class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
            :disabled="busy || !items.length || !canEditConfig"
            @click="emit('check-duplicates')"
          >
            Check Duplicates
          </button>
          <button
            class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
            :disabled="busy || !items.length"
            @click="emit('ignore-all-duplicates')"
          >
            Ignore All Duplicates
          </button>
          <button
            class="px-3 py-1.5 rounded-lg border border-orange-200 text-orange-700 text-sm hover:bg-orange-50"
            :disabled="busy || !items.length"
            @click="emit('overwrite-all-duplicates')"
          >
            Overwrite All Duplicates
          </button>
          <button
            class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:bg-blue-300"
            :disabled="busy || !items.length"
            @click="emit('import-ready-items')"
          >
            Import Ready Items
          </button>
          <button
            v-if="canCancel"
            class="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50"
            @click="emit('cancel-operation')"
          >
            Cancel Batch Operation
          </button>
          <button
            v-if="canResume"
            class="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 text-sm hover:bg-blue-50"
            :disabled="busy"
            @click="emit('resume-operation')"
          >
            Resume
          </button>
          <button
            v-if="canResume"
            class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50"
            :disabled="busy"
            @click="emit('restart-operation')"
          >
            Restart
          </button>
        </div>

        <div v-if="canResume && lastStoppedPhase" class="text-xs text-amber-700">
          Batch operation was cancelled during {{ lastStoppedPhase }}.
        </div>

        <div v-if="progress.total > 0" class="space-y-2">
          <div class="text-xs text-slate-600 font-medium">{{ progressLabel }}</div>
          <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              class="h-full bg-blue-500 transition-all duration-300"
              :style="{ width: `${progress.percent}%` }"
            />
          </div>
        </div>

        <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
          {{ error }}
        </div>
      </div>

      <div class="flex-1 overflow-auto">
        <table class="min-w-full">
          <thead class="bg-slate-50 sticky top-0">
            <tr>
              <th class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Lemma
              </th>
              <th class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Source
              </th>
              <th class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Status
              </th>
              <th class="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Details
              </th>
              <th class="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Action
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in items" :key="item.key" class="hover:bg-slate-50/70">
              <td class="px-4 py-3 text-sm font-semibold text-slate-900">{{ item.lemma }}</td>
              <td class="px-4 py-3 text-xs text-slate-600">
                <span
                  :class="
                    item.record.isLocal
                      ? 'inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200'
                      : 'inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200'
                  "
                >
                  <i :class="item.record.isLocal ? 'fa-solid fa-laptop' : 'fa-solid fa-cloud'" />
                  {{ item.record.isLocal ? 'Local' : 'DB' }}
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
              <td class="px-4 py-3 text-xs text-slate-600">
                <span v-if="item.conflict">Duplicate noteId: {{ item.conflict.noteId }}</span>
                <span v-else-if="item.noteId">NoteId: {{ item.noteId }}</span>
                <span v-else-if="item.error" class="text-red-600">{{ item.error }}</span>
                <span v-else>-</span>
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  class="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
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
</template>
