<script setup lang="ts">
import type { DiffBadge, SyncActionMap, SyncCheckItem } from '@/types/word-list';

defineProps<{
  open: boolean;
  loading: boolean;
  checks: SyncCheckItem[];
  actions: SyncActionMap;
  getDiffBadges: (diff: unknown[] | undefined) => DiffBadge[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'set-action', id: string, action: 'skip' | 'overwrite'): void;
  (e: 'sync'): void;
}>();
</script>

<template>
  <div
      v-if="open"
      class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
  >
    <div class="w-full max-w-3xl rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between">
        <span>Sync All</span>
        <button
            class="text-slate-400 hover:text-slate-600 transition-colors"
            @click="emit('close')"
        >
          <i class="fa-solid fa-xmark text-xl"/>
        </button>
      </div>
      <div class="px-4 py-3 text-sm text-slate-600 border-b border-slate-100">
        Found {{ checks.filter(c => c.status === 'conflict').length }} conflicts among {{ checks.length }}
        items
      </div>
      <div class="max-h-[60vh] overflow-y-auto p-4 space-y-2">
        <div
            v-for="c in checks"
            :key="c.id"
            class="p-3 rounded-lg border flex items-center justify-between gap-3"
            :class="c.status === 'conflict' ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'"
        >
          <div class="min-w-0">
            <div class="font-bold text-slate-800 truncate">
              {{ c.lemma || 'unknown' }}
            </div>
            <div class="text-xs text-slate-500">
              {{ c.status }}
            </div>
            <div
                v-if="c.status === 'conflict'"
                class="mt-2 flex flex-wrap gap-1"
            >
              <span
                  v-for="b in getDiffBadges(c.diff)"
                  :key="b.path"
                  class="px-2 py-0.5 rounded border text-[10px] font-bold"
                  :class="b.cls"
              >{{ b.path }}</span>
            </div>
          </div>
          <div
              v-if="c.status === 'conflict'"
              class="flex items-center gap-3 flex-none"
          >
            <label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                  type="radio"
                  :name="`action_${c.id}`"
                  value="skip"
                  class="text-primary"
                  :checked="(actions[c.id] || 'skip') === 'skip'"
                  @change="emit('set-action', c.id, 'skip')"
              >
              <span>Skip</span>
            </label>
            <label class="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                  type="radio"
                  :name="`action_${c.id}`"
                  value="overwrite"
                  class="text-red-500 focus:ring-red-500"
                  :checked="actions[c.id] === 'overwrite'"
                  @change="emit('set-action', c.id, 'overwrite')"
              >
              <span>Overwrite</span>
            </label>
          </div>
          <div
              v-else
              class="text-xs text-green-700 font-bold flex-none"
          >
            Will Sync
          </div>
        </div>
      </div>
      <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
        <button
            class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors"
            @click="emit('close')"
        >
          Cancel
        </button>
        <button
            :disabled="loading"
            class="px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
            @click="emit('sync')"
        >
          Sync
        </button>
      </div>
    </div>
  </div>
</template>
