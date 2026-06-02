import { computed, ref } from 'vue';
import type { WordRecord } from '@/types/word-list';

export type WordListColumnKey =
  | 'language'
  | 'partOfSpeech'
  | 'revisionCount'
  | 'createdAt'
  | 'updatedAt';

const columnLabels: Record<WordListColumnKey, string> = {
  language: 'Lang',
  partOfSpeech: 'PoS',
  revisionCount: 'Rev',
  createdAt: 'Created',
  updatedAt: 'Updated',
};

const allColumnKeys: WordListColumnKey[] = [
  'language',
  'partOfSpeech',
  'revisionCount',
  'createdAt',
  'updatedAt',
];

export const useWordListColumns = () => {
  const visibleColumns = ref<Record<WordListColumnKey, boolean>>({
    language: false,
    partOfSpeech: false,
    revisionCount: false,
    createdAt: false,
    updatedAt: false,
  });
  const columnMenuOpen = ref(false);
  const shownColumns = computed<WordListColumnKey[]>(() =>
    allColumnKeys.filter(k => visibleColumns.value[k])
  );

  const toggleColumn = (key: WordListColumnKey): void => {
    visibleColumns.value[key] = !visibleColumns.value[key];
  };

  const formatColValue = (item: WordRecord, key: WordListColumnKey): string => {
    switch (key) {
      case 'language':
        return (item as any).language || '';
      case 'partOfSpeech':
        return (item as any).part_of_speech || '';
      case 'revisionCount':
        return String((item as any).revision_count ?? '');
      case 'createdAt':
        return (item as any).created_at?.substring(0, 10) || '';
      case 'updatedAt':
        return (item as any).updated_at?.substring(0, 10) || '';
    }
  };

  return {
    allColumnKeys,
    columnLabels,
    columnMenuOpen,
    visibleColumns,
    shownColumns,
    toggleColumn,
    formatColValue,
  };
};
