import { computed, ref } from 'vue';

type OverlayId = 'ai-generate' | 'schema-reference' | 'announcement';

const BASE_OVERLAY_Z_INDEX = 30;
const stack = ref<OverlayId[]>([]);

function bringOverlayToFront(id: OverlayId): void {
  stack.value = [...stack.value.filter(item => item !== id), id];
}

function removeOverlay(id: OverlayId): void {
  stack.value = stack.value.filter(item => item !== id);
}

function getOverlayZIndex(id: OverlayId): number {
  const index = stack.value.indexOf(id);
  return BASE_OVERLAY_Z_INDEX + Math.max(index, 0);
}

export function useOverlayStack(id: OverlayId) {
  return {
    zIndex: computed(() => getOverlayZIndex(id)),
    bringToFront: () => bringOverlayToFront(id),
    remove: () => removeOverlay(id),
  };
}

export function bringOverlayToFrontById(id: OverlayId): void {
  bringOverlayToFront(id);
}
