<script setup lang="ts">
import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';

const appStore = useAppStore();
const { toasts } = storeToRefs(appStore);

const remove = (id: number) => {
  appStore.removeToast(id);
};
</script>

<template>
  <div class="toast-container" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="{
          info: toast.type === 'info',
          success: toast.type === 'success',
          warning: toast.type === 'warning',
          error: toast.type === 'error',
        }"
      >
        <div class="toast-icon">
          <!-- Success -->
          <svg v-if="toast.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <!-- Error -->
          <svg v-else-if="toast.type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6M9 9l6 6" />
          </svg>
          <!-- Warning -->
          <svg v-else-if="toast.type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <!-- Info -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>
        <div class="toast-message">{{ toast.message }}</div>
        <button class="toast-close" @click="remove(toast.id)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  min-width: 300px;
  max-width: 448px;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border);
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.toast-item.info {
  border-left: 4px solid var(--blue);
}

.toast-item.success {
  border-left: 4px solid var(--green);
}

.toast-item.warning {
  border-left: 4px solid var(--amber);
}

.toast-item.error {
  border-left: 4px solid var(--red);
}

.toast-icon {
  flex-shrink: 0;
  padding-top: 1px;
}

.toast-item.info .toast-icon {
  color: var(--blue);
}

.toast-item.success .toast-icon {
  color: var(--green);
}

.toast-item.warning .toast-icon {
  color: var(--amber);
}

.toast-item.error .toast-icon {
  color: var(--red);
}

.toast-icon svg {
  width: 18px;
  height: 18px;
}

.toast-message {
  flex: 1;
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
  word-break: break-word;
  line-height: 1.5;
}

.toast-close {
  flex-shrink: 0;
  background: transparent;
  border: 0;
  padding: 2px;
  color: var(--faint);
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s ease;
}

.toast-close:hover {
  color: var(--text);
}

.toast-close svg {
  width: 16px;
  height: 16px;
}

/* Transitions */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
