import { reactive } from 'vue';
import yaml from 'js-yaml';
import type { EditorStatus } from '@/types/word-editor';

export interface FormatDiagnosticMessage {
  code: string;
  message: string;
  path?: string;
  suggestion?: string;
}

export interface FormatValidationResponse {
  valid: boolean;
  errors: string[];
  language?: string;
  yaml?: string;
  changed?: boolean;
  repairs?: Array<{ type: string; message?: string }>;
  diagnostics?: FormatDiagnosticMessage[];
}

export interface StrictValidationPayload {
  yaml: string;
  repair: false;
}

export interface WordEditorValidationState {
  status: EditorStatus;
  schemaErrors: string[];
  validating: boolean;
}

interface WordEditorValidationControllerOptions {
  validateYaml: (payload: StrictValidationPayload) => Promise<FormatValidationResponse>;
  inputDebounceMs?: number;
  serverDebounceMs?: number;
  parseYaml?: (text: string) => unknown;
}

export function formatValidationMessages(res: FormatValidationResponse): string[] {
  if (res.changed && Array.isArray(res.repairs) && res.repairs.length > 0) {
    return res.repairs.map(repair => repair.message || 'Format repair is available.');
  }

  if (Array.isArray(res.diagnostics) && res.diagnostics.length > 0) {
    return res.diagnostics.map(diagnostic => {
      const path = diagnostic.path ? `${diagnostic.path}: ` : '';
      return `${path}${diagnostic.message}`;
    });
  }
  return res.errors || [];
}

export function createWordEditorValidationController({
  validateYaml,
  inputDebounceMs = 500,
  serverDebounceMs = 300,
  parseYaml = yaml.load,
}: WordEditorValidationControllerOptions) {
  const state = reactive<WordEditorValidationState>({
    status: '',
    schemaErrors: [],
    validating: false,
  });

  let clientParseTimer: ReturnType<typeof setTimeout> | null = null;
  let validateTimer: ReturnType<typeof setTimeout> | null = null;
  let validationRequestId = 0;
  let currentYaml = '';

  const clearClientTimer = (): void => {
    if (clientParseTimer) clearTimeout(clientParseTimer);
    clientParseTimer = null;
  };

  const clearValidateTimer = (): void => {
    if (validateTimer) clearTimeout(validateTimer);
    validateTimer = null;
  };

  const reset = (): void => {
    validationRequestId += 1;
    clearClientTimer();
    clearValidateTimer();
    state.status = '';
    state.schemaErrors = [];
    state.validating = false;
  };

  const runServerValidationNow = async (
    yamlToValidate: string,
    requestId: number
  ): Promise<void> => {
    state.validating = true;
    try {
      const res = await validateYaml({
        yaml: yamlToValidate,
        repair: false,
      });
      if (requestId !== validationRequestId || currentYaml !== yamlToValidate) return;

      if (res.valid) {
        state.schemaErrors = [];
        state.status = 'Valid YAML';
      } else {
        state.schemaErrors = formatValidationMessages(res);
        state.status = 'Invalid YAML';
      }
    } catch {
      if (requestId !== validationRequestId || currentYaml !== yamlToValidate) return;
      state.schemaErrors = [];
    } finally {
      if (requestId === validationRequestId) {
        state.validating = false;
      }
    }
  };

  const runServerValidation = (yamlToValidate: string, requestId: number): void => {
    clearValidateTimer();
    if (serverDebounceMs <= 0) {
      void runServerValidationNow(yamlToValidate, requestId);
      return;
    }
    validateTimer = setTimeout(() => {
      void runServerValidationNow(yamlToValidate, requestId);
    }, serverDebounceMs);
  };

  const runClientParse = (yamlToValidate: string, requestId: number): void => {
    if (requestId !== validationRequestId || currentYaml !== yamlToValidate) return;

    try {
      const result = parseYaml(yamlToValidate) as Record<string, unknown> | null;
      if (
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        result.yield !== undefined
      ) {
        state.status = 'Checking YAML';
        state.schemaErrors = [];
        runServerValidation(yamlToValidate, requestId);
        return;
      }

      state.status = 'Invalid YAML';
      state.schemaErrors = [];
      clearValidateTimer();
    } catch {
      state.status = 'Invalid YAML';
      state.schemaErrors = [];
      clearValidateTimer();
    }
  };

  const handleTextChanged = (yamlText: string): void => {
    currentYaml = yamlText;
    validationRequestId += 1;
    const requestId = validationRequestId;

    if (!yamlText || yamlText.trim().length === 0) {
      reset();
      return;
    }

    state.status = 'Checking YAML';
    clearClientTimer();
    if (inputDebounceMs <= 0) {
      runClientParse(yamlText, requestId);
      return;
    }
    clientParseTimer = setTimeout(() => runClientParse(yamlText, requestId), inputDebounceMs);
  };

  const dispose = (): void => {
    reset();
  };

  return {
    state,
    handleTextChanged,
    reset,
    dispose,
  };
}
