<script setup lang="ts">
import type { WordRecord } from '@/types/word-list';

const props = defineProps<{
  open: boolean;
  item: WordRecord | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'sync', id: string): void;
  (e: 'export'): void;
  (e: 'delete', id: string, isLocal: boolean): void;
}>();

const emitSync = () => {
  if (!props.item?.id) return;
  emit('sync', props.item.id);
};

const emitDelete = () => {
  if (!props.item?.id) return;
  emit('delete', props.item.id, !!props.item.isLocal);
};
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-30 bg-black/30" @click="emit('close')" />
  <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center p-4">
    <div
      class="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden"
    >
      <div
        class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between"
      >
        <span>More</span>
        <button
          class="text-slate-400 hover:text-slate-600 transition-colors"
          @click="emit('close')"
        >
          <i class="fa-solid fa-xmark text-xl" />
        </button>
      </div>
      <div class="p-2">
        <button
          v-if="item?.isLocal"
          class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2"
          @click="emitSync"
        >
          <i class="fa-solid fa-cloud-arrow-up w-5 text-center" />
          <span>Sync</span>
        </button>
        <button
          class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2"
          @click="emit('export')"
        >
          <i class="fa-solid fa-download w-5 text-center" />
          <span>Export</span>
        </button>
        <button
          class="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-2"
          @click="emitDelete"
        >
          <i class="fa-solid fa-trash w-5 text-center" />
          <span>Delete</span>
        </button>
      </div>
    </div>
  </div>
</template>
