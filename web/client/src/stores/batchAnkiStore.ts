import { defineStore } from 'pinia';
import { getDefaultAnkiOptions } from '@/services/ankiExportService';
import { getInitialAnkiExportOptions } from '@/services/ankiExportOptionsStore';
import type { BatchAnkiExportItem, BatchAnkiProgress } from '@/types/anki';

interface BatchAnkiState {
  isOpen: boolean;
  busy: boolean;
  error: string;
  items: BatchAnkiExportItem[];
  progress: BatchAnkiProgress;
  taskStarted: boolean;
  configLocked: boolean;
  cancelRequested: boolean;
  canResume: boolean;
  lastStoppedPhase: 'check' | 'import' | null;
  ankiConnected: boolean;
  deckOptions: string[];
  modelOptions: string[];
  deckName: string;
  modelName: string;
  addReverse: boolean;
  tagsInput: string;
  summaryVisible: boolean;
}

const defaults = getDefaultAnkiOptions();
const initial = getInitialAnkiExportOptions();

const defaultProgress = (): BatchAnkiProgress => ({
  phase: 'idle',
  processed: 0,
  total: 0,
  percent: 0,
});

export const useBatchAnkiStore = defineStore('batchAnki', {
  state: (): BatchAnkiState => ({
    isOpen: false,
    busy: false,
    error: '',
    items: [],
    progress: defaultProgress(),
    taskStarted: false,
    configLocked: false,
    cancelRequested: false,
    canResume: false,
    lastStoppedPhase: null,
    ankiConnected: false,
    deckOptions: [],
    modelOptions: [],
    deckName: initial.deckName || defaults.deckName,
    modelName: initial.modelName || defaults.modelName,
    addReverse:
      typeof initial.addReverse === 'boolean' ? initial.addReverse : defaults.addReverse,
    tagsInput: initial.tagsInput || defaults.tags.join(', '),
    summaryVisible: false,
  }),
  actions: {
    resetProgress(): void {
      this.progress = defaultProgress();
    },
    resetTaskState(): void {
      this.items = [];
      this.error = '';
      this.taskStarted = false;
      this.configLocked = false;
      this.cancelRequested = false;
      this.canResume = false;
      this.lastStoppedPhase = null;
      this.summaryVisible = false;
      this.resetProgress();
    },
  },
});
