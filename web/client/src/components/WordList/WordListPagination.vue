<script setup lang="ts">
defineProps<{
  page: number;
  totalPages: number;
  paginationRange: Array<number | '...'>;
}>();

const emit = defineEmits<{
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'go-to', page: number): void;
}>();
</script>

<template>
  <div
      class="p-3 border-t border-slate-100 bg-white flex justify-between items-center text-xs text-slate-500 flex-none"
  >
    <span class="font-medium">Page {{ page }} of {{ totalPages }}</span>
    <div class="flex items-center gap-2">
      <button
          :disabled="page <= 1"
          class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          @click="emit('prev')"
      >
        Prev
      </button>
      <div class="flex items-center gap-1">
        <button
            v-for="(p, index) in paginationRange"
            :key="index"
            :class="[
            'px-2.5 py-1 text-xs rounded transition-colors',
            p === page
              ? 'bg-primary text-white font-bold'
              : typeof p === 'number'
                ? 'hover:bg-slate-100 text-slate-600'
                : 'text-slate-400 cursor-default'
          ]"
            :disabled="typeof p !== 'number'"
            @click="typeof p === 'number' ? emit('go-to', p) : null"
        >
          {{ p }}
        </button>
      </div>
      <button
          :disabled="page >= totalPages"
          class="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          @click="emit('next')"
      >
        Next
      </button>
    </div>
  </div>
</template>
