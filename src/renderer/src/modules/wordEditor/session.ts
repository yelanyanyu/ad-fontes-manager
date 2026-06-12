import { computed, ref } from 'vue';

export type WordEditorSessionMode = 'create' | 'update';
export type WordSchemaFreshness = 'current' | 'old' | 'future';

export interface WordEditorSessionContext {
  id?: string | number | null;
  wordSchemaVersion?: number | null;
  isLatestSchema?: boolean | null;
}

export interface WordEditorSessionSnapshot {
  yaml: string;
  reloadToken: number;
  context: WordEditorSessionContext;
}

export interface WordEditorValidationContext {
  intent: 'create' | 'update-existing';
  wordId?: string | number;
  baseWordSchemaVersion?: number;
}

export function createWordEditorSession() {
  const currentYaml = ref('');
  const mode = ref<WordEditorSessionMode>('create');
  const baseWordId = ref<string | number | null>(null);
  const baseWordSchemaVersion = ref<number | null>(null);
  const baseIsLatestSchema = ref<boolean | null>(null);

  const displayFreshness = computed<Exclude<WordSchemaFreshness, 'current'> | null>(() => {
    if (mode.value !== 'update') return null;
    if (baseIsLatestSchema.value === false) return 'old';
    return null;
  });

  const validationContext = computed<WordEditorValidationContext>(() => ({
    intent: mode.value === 'update' ? 'update-existing' : 'create',
    wordId: baseWordId.value ?? undefined,
    baseWordSchemaVersion: baseWordSchemaVersion.value ?? undefined,
  }));

  const loadNewWord = (yamlText = ''): void => {
    currentYaml.value = yamlText;
    mode.value = 'create';
    baseWordId.value = null;
    baseWordSchemaVersion.value = null;
    baseIsLatestSchema.value = null;
  };

  const loadExistingWord = (yamlText: string, context: WordEditorSessionContext): void => {
    currentYaml.value = yamlText;
    mode.value = 'update';
    baseWordId.value = context.id ?? null;
    baseWordSchemaVersion.value = context.wordSchemaVersion ?? null;
    baseIsLatestSchema.value = context.isLatestSchema ?? null;
  };

  return {
    currentYaml,
    mode,
    baseWordId,
    baseWordSchemaVersion,
    baseIsLatestSchema,
    displayFreshness,
    validationContext,
    loadNewWord,
    loadExistingWord,
  };
}
