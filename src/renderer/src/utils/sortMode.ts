import type { SortMode } from '@/types/word-list';

const SORT_MODES = new Set<SortMode>([
  'az',
  'za',
  'newest',
  'oldest',
  'updated-newest',
  'updated-oldest',
]);

export const isSortMode = (value: string): value is SortMode => {
  return SORT_MODES.has(value as SortMode);
};
