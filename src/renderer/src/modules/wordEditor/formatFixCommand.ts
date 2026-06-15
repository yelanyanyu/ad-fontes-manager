import { reactive } from 'vue';
import type { EditorStatus } from '@/types/word-editor';
import {
  formatValidationMessages,
  type FormatValidationResponse,
  type WordEditorValidationState,
} from './validationController';

type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface FormatFixPayload {
  yaml: string;
}

export type FormatFixOutcome =
  | { status: 'empty' }
  | { status: 'repaired'; response: FormatValidationResponse }
  | { status: 'partiallyRepaired'; response: FormatValidationResponse }
  | { status: 'notRepaired'; response: FormatValidationResponse };

interface FormatFixCommandOptions {
  state: WordEditorValidationState;
  repairYaml: (payload: FormatFixPayload) => Promise<FormatValidationResponse>;
  replaceYaml: (yamlText: string) => void;
  addToast: (message: string, type?: ToastType) => void;
}

function firstValidationMessage(res: FormatValidationResponse): string {
  return formatValidationMessages(res)[0] || 'Review the YAML error details.';
}

export function createFormatFixCommand({
  state,
  repairYaml,
  replaceYaml,
  addToast,
}: FormatFixCommandOptions) {
  const commandState = reactive({
    repairing: false,
  });

  const run = async (yamlText: string): Promise<FormatFixOutcome> => {
    if (!yamlText || commandState.repairing) return { status: 'empty' };

    commandState.repairing = true;
    try {
      const res = await repairYaml({ yaml: yamlText });
      state.schemaErrors = formatValidationMessages(res);
      state.status = (res.valid ? 'Valid YAML' : 'Invalid YAML') as EditorStatus;

      if (res.changed && typeof res.yaml === 'string') {
        replaceYaml(res.yaml);
        addToast(
          res.valid ? 'Format repaired.' : 'Format partly repaired; remaining errors need review.',
          res.valid ? 'success' : 'warning'
        );
        return { status: res.valid ? 'repaired' : 'partiallyRepaired', response: res };
      }

      addToast(
        res.valid
          ? 'No format repairs needed.'
          : `No safe automatic repair was available: ${firstValidationMessage(res)}`,
        res.valid ? 'info' : 'warning'
      );
      return { status: 'notRepaired', response: res };
    } finally {
      commandState.repairing = false;
    }
  };

  return {
    state: commandState,
    run,
  };
}
