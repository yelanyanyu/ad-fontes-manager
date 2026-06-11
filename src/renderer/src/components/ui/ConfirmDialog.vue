<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
    requiredText?: string;
    requiredTextLabel?: string;
    requiredTextPlaceholder?: string;
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
    requiredText: '',
    requiredTextLabel: '',
    requiredTextPlaceholder: '',
  }
);

const confirmationInput = ref('');
const requiresText = computed(() => props.requiredText.trim().length > 0);
const canConfirm = computed(
  () => !requiresText.value || confirmationInput.value === props.requiredText
);

watch(
  () => props.open,
  open => {
    if (open) confirmationInput.value = '';
  }
);

const confirm = (): void => {
  if (!canConfirm.value) return;
  emit('confirm');
};

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
          <label v-if="requiresText" class="confirm-text-field">
            <span>{{ requiredTextLabel || `Type "${requiredText}" to confirm.` }}</span>
            <input
              v-model="confirmationInput"
              class="ui-input"
              type="text"
              :placeholder="requiredTextPlaceholder || requiredText"
              autocomplete="off"
            />
          </label>
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
            :disabled="!canConfirm"
            @click="confirm"
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

.confirm-text-field {
  display: grid;
  gap: 7px;
  margin-top: 14px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-soft);
}
</style>
