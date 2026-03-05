<script setup lang="ts">
defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm'): void;
}>();
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
    <div
      class="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden"
    >
      <div class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800">
Delete Word
</div>
      <div class="px-4 py-4 text-sm text-slate-600">
确认删除该词条？此操作不可撤销。
</div>
      <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
        <button
          class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
          @click="emit('confirm')"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
