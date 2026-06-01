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
      class="ui-dialog-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.self="emit('cancel')"
    >
      <div class="ui-dialog-card">
        <div class="ui-dialog-head">
          <h3 class="ui-dialog-title">{{ title }}</h3>
        </div>
        <div class="ui-dialog-body">
          <p class="ui-dialog-message">{{ message }}</p>
        </div>
        <div class="ui-dialog-actions">
          <button
            type="button"
            class="ui-button ui-button--quiet confirm-btn"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="ui-button confirm-btn"
            :class="variant === 'danger' ? 'ui-button--danger' : 'ui-button--primary'"
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
.confirm-btn {
  height: 34px;
  border-radius: var(--radius-sm);
  font-weight: 650;
}
</style>
