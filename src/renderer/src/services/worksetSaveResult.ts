export type WorksetSaveStatus = 'saved' | 'conflict' | 'invalid' | 'missing' | 'error';

export interface WorksetSaveDetail {
  status: WorksetSaveStatus;
  label: string;
  message: string;
}

const yamlErrorPatterns = [
  'invalid yaml',
  'yaml parse',
  'yaml missing',
  'no yaml',
  'yield.lemma',
  'yaml content is required',
  'yaml must be an object',
];

function isYamlError(message: string): boolean {
  const normalized = message.toLowerCase();
  return yamlErrorPatterns.some(pattern => normalized.includes(pattern));
}

export function describeWorksetSaveResult(result: Record<string, unknown>): WorksetSaveDetail {
  if (result.success === true) {
    const status = String(result.status || 'saved');
    return {
      status: 'saved',
      label: status,
      message: `Saved as ${status}.`,
    };
  }

  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      label: 'conflict',
      message: 'Existing Word differs. Open the row to review, or overwrite conflicts explicitly.',
    };
  }

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    return {
      status: 'invalid',
      label: 'invalid',
      message: result.errors.map(error => String(error)).join('; '),
    };
  }

  const message = String(result.error || 'Save failed.');
  if (isYamlError(message)) {
    return {
      status: 'invalid',
      label: 'invalid',
      message,
    };
  }

  return {
    status: 'error',
    label: 'error',
    message,
  };
}
