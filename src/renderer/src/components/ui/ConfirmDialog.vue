<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
  }
);

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="confirm-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.self="emit('cancel')"
    >
      <div class="confirm-card">
        <div class="confirm-head">
          <h3>{{ title }}</h3>
        </div>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn" @click="emit('cancel')">
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="confirm-btn primary"
            :class="{ danger: variant === 'danger' }"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(20, 16, 10, 0.32);
}

.confirm-card {
  width: min(420px, 100%);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.confirm-head {
  border-bottom: 1px solid var(--line);
  padding: 14px 16px;
}

.confirm-head h3 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 750;
}

.confirm-message {
  margin: 0;
  padding: 16px;
  color: var(--text-soft);
  font-size: 14px;
  line-height: 1.55;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--line);
  padding: 12px 16px;
  background: var(--surface-soft);
}

.confirm-btn {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-soft);
  padding: 0 14px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.confirm-btn:hover {
  border-color: var(--green-border);
  color: var(--green);
}

.confirm-btn.primary {
  border-color: var(--green);
  background: var(--green);
  color: white;
}

.confirm-btn.primary:hover {
  background: var(--green-strong);
}

.confirm-btn.primary.danger {
  border-color: var(--red);
  background: var(--red);
}
</style>
