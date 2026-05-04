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
  <div v-if="open" class="modal-backdrop" @click="emit('close')" />
  <div v-if="open" class="modal-wrapper">
    <div class="menu-panel">
      <div class="menu-header">
        <span>More</span>
        <button class="head-link" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="menu-body">
        <button
          v-if="item?.isLocal"
          class="menu-item"
          @click="emitSync"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          <span>Sync</span>
        </button>
        <button class="menu-item" @click="emit('export')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          <span>Export</span>
        </button>
        <button class="menu-item danger" @click="emitDelete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>Delete</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.3);
}

.modal-wrapper {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.menu-panel {
  width: 100%;
  max-width: 320px;
  border-radius: var(--radius-xl);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.menu-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  font-weight: 700;
  color: var(--text);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head-link {
  border: 0;
  background: transparent;
  color: var(--faint);
  cursor: pointer;
  padding: 2px;
  border-radius: var(--radius-sm);
}

.head-link:hover {
  color: var(--text);
}

.menu-body {
  padding: 4px;
}

.menu-item {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.menu-item:hover {
  background: var(--surface-soft);
}

.menu-item.danger {
  color: var(--red);
}

.menu-item.danger:hover {
  background: var(--red-soft);
}
</style>
