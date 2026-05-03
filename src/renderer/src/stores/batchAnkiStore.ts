import { defineStore } from 'pinia';
import { getDefaultAnkiOptions } from '@/services/ankiExportService';
import { getInitialAnkiExportOptions } from '@/services/ankiExportOptionsStore';
import type {
  AnkiModelTemplate,
  BatchAnkiExportItem,
  BatchAnkiProgress,
  FieldMappingConfig,
} from '@/types/anki';

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
  modelFieldNames: string[];
  templateOptions: AnkiModelTemplate[];
  deckName: string;
  modelName: string;
  templateName: string;
  tagsInput: string;
  fieldMapping: FieldMappingConfig;
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
    modelFieldNames: [],
    templateOptions: [],
    deckName: initial.deckName || defaults.deckName,
    modelName: initial.modelName || defaults.modelName,
    templateName: initial.templateName || '',
    tagsInput: initial.tagsInput || defaults.tags.join(', '),
    fieldMapping: [],
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
