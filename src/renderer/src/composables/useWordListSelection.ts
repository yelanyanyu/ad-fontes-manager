import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { WordRecord } from '@/types/word-list';
import {
  addVisibleSelections,
  getSelectedLemmas,
  isWordSelected,
  makeWordSelectionKey,
  removeVisibleSelections,
} from '@/utils/wordSelection';

export const useWordListSelection = (visibleRecords: Readonly<Ref<WordRecord[]>>) => {
  const selectedKeys = ref<Set<string>>(new Set());
  const selectedItemsByKey = ref<Map<string, WordRecord>>(new Map());

  const selectedCount = computed<number>(() => selectedKeys.value.size);
  const hasSelection = computed<boolean>(() => selectedCount.value > 0);
  const selectedExportRecords = computed<WordRecord[]>(() => [
    ...selectedItemsByKey.value.values(),
  ]);
  const visibleSelectedCount = computed<number>(() => {
    return visibleRecords.value.filter(item => isWordSelected(selectedKeys.value, item)).length;
  });
  const selectedLemmas = computed<string[]>(() => {
    return getSelectedLemmas([...selectedItemsByKey.value.values()]);
  });
  const isAllVisibleSelected = computed<boolean>(() => {
    return (
      visibleRecords.value.length > 0 && visibleSelectedCount.value === visibleRecords.value.length
    );
  });

  const clearSelection = (): void => {
    if (selectedKeys.value.size > 0) {
      selectedKeys.value = new Set();
      selectedItemsByKey.value = new Map();
    }
  };

  const isSelected = (item: WordRecord): boolean => {
    return isWordSelected(selectedKeys.value, item);
  };

  const toggleSelection = (item: WordRecord): void => {
    const key = makeWordSelectionKey(item);
    const nextKeys = new Set(selectedKeys.value);
    const nextItems = new Map(selectedItemsByKey.value);
    if (nextKeys.has(key)) {
      nextKeys.delete(key);
      nextItems.delete(key);
    } else {
      nextKeys.add(key);
      nextItems.set(key, { ...item });
    }
    selectedKeys.value = nextKeys;
    selectedItemsByKey.value = nextItems;
  };

  const toggleSelectAllVisible = (): void => {
    if (!visibleRecords.value.length) return;
    const nextItems = new Map(selectedItemsByKey.value);
    if (isAllVisibleSelected.value) {
      selectedKeys.value = removeVisibleSelections(selectedKeys.value, visibleRecords.value);
      visibleRecords.value.forEach(item => {
        nextItems.delete(makeWordSelectionKey(item));
      });
      selectedItemsByKey.value = nextItems;
      return;
    }
    selectedKeys.value = addVisibleSelections(selectedKeys.value, visibleRecords.value);
    visibleRecords.value.forEach(item => {
      nextItems.set(makeWordSelectionKey(item), { ...item });
    });
    selectedItemsByKey.value = nextItems;
  };

  const replaceSelectionMap = (nextItems: Map<string, WordRecord>): void => {
    selectedItemsByKey.value = nextItems;
    selectedKeys.value = new Set(nextItems.keys());
  };

  return {
    selectedKeys,
    selectedItemsByKey,
    selectedCount,
    hasSelection,
    selectedExportRecords,
    selectedLemmas,
    isAllVisibleSelected,
    clearSelection,
    isSelected,
    toggleSelection,
    toggleSelectAllVisible,
    replaceSelectionMap,
  };
};
