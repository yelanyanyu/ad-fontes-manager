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
  <div class="footer">
    <span>Page {{ page }} of {{ totalPages }}</span>
    <div class="pages">
      <button
        :class="['page', { ghost: page <= 1 }]"
        :disabled="page <= 1"
        @click="emit('prev')"
      >
        Prev
      </button>
      <button
        v-for="(p, index) in paginationRange"
        :key="index"
        :class="[
          'page',
          p === page ? 'active' : '',
          typeof p !== 'number' ? 'ghost' : '',
        ]"
        :disabled="typeof p !== 'number'"
        @click="typeof p === 'number' ? emit('go-to', p) : undefined"
      >
        {{ p }}
      </button>
      <button
        :class="['page', { ghost: page >= totalPages }]"
        :disabled="page >= totalPages"
        @click="emit('next')"
      >
        Next
      </button>
    </div>
  </div>
</template>

<style scoped>
.footer {
  height: 48px;
  padding: 0 14px;
  background: var(--surface);
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #746e66;
  font-size: 12px;
  flex: none;
}

[data-theme="dark"] .footer {
  background: #26231e;
  color: #aaa197;
}

.pages {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #69635b;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

[data-theme="dark"] .page {
  color: #bdb3a7;
}

.page:hover:not(.ghost):not(.active) {
  background: var(--surface-soft);
}

.page.active {
  background: var(--green);
  color: #fff;
  font-weight: 740;
  box-shadow: 0 4px 12px rgba(36, 114, 83, 0.16);
}

[data-theme="dark"] .page.active {
  color: #07110c;
  box-shadow: 0 4px 14px rgba(67, 179, 127, 0.18);
}

.page.ghost {
  opacity: 0.46;
  cursor: default;
}
</style>
