import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createWordEditorValidationController } from './validationController';

describe('createWordEditorValidationController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces strict validation and sends repair=false', async () => {
    const validateYaml = vi.fn().mockResolvedValue({ valid: true, errors: [] });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 500,
      serverDebounceMs: 300,
    });

    controller.handleTextChanged('yield:\n  lemma: after\n');
    controller.handleTextChanged('yield:\n  lemma: after\n  language: en\n');

    expect(controller.state.status).toBe('Checking YAML');
    expect(validateYaml).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(799);
    expect(validateYaml).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(validateYaml).toHaveBeenCalledTimes(1);
    expect(validateYaml).toHaveBeenCalledWith({
      yaml: 'yield:\n  lemma: after\n  language: en\n',
      repair: false,
      intent: undefined,
      wordId: undefined,
    });
    expect(controller.state.status).toBe('Valid YAML');
    expect(controller.state.schemaErrors).toEqual([]);
  });

  it('sends update-existing intent when supplied by the editor context', async () => {
    const validateYaml = vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
      canSave: true,
      schemaFreshness: 'old',
      notices: ['This is an old Word structure.'],
    });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 0,
      getIntent: () => 'update-existing',
    });

    controller.handleTextChanged('yield:\n  lemma: legacy\n');
    await vi.runOnlyPendingTimersAsync();

    expect(validateYaml).toHaveBeenCalledWith({
      yaml: 'yield:\n  lemma: legacy\n',
      repair: false,
      intent: 'update-existing',
      wordId: undefined,
    });
    expect(controller.state.status).toBe('Valid YAML');
    expect(controller.state.schemaFreshness).toBe('old');
    expect(controller.state.notices).toEqual(['This is an old Word structure.']);
    expect(controller.state.schemaErrors).toEqual([]);
  });

  it('sends the editing word id when validating an existing word', async () => {
    const validateYaml = vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
      schemaFreshness: 'current',
      notices: [],
    });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 0,
      getIntent: () => 'update-existing',
      getWordId: () => 'word-123',
    });

    controller.handleTextChanged('yield:\n  lemma: current\n');
    await vi.runOnlyPendingTimersAsync();

    expect(validateYaml).toHaveBeenCalledWith({
      yaml: 'yield:\n  lemma: current\n',
      repair: false,
      intent: 'update-existing',
      wordId: 'word-123',
    });
    expect(controller.state.schemaFreshness).toBe('current');
    expect(controller.state.notices).toEqual([]);
  });

  it('sends the base Word Schema Version from the editor session', async () => {
    const validateYaml = vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
      schemaFreshness: 'old',
      notices: ['This is an old Word structure.'],
    });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 0,
      getIntent: () => 'update-existing',
      getWordId: () => 'word-1',
      getBaseWordSchemaVersion: () => 1,
    });

    controller.handleTextChanged('yield:\n  lemma: legacy\n');
    await vi.runOnlyPendingTimersAsync();

    expect(validateYaml).toHaveBeenCalledWith({
      yaml: 'yield:\n  lemma: legacy\n',
      repair: false,
      intent: 'update-existing',
      wordId: 'word-1',
      baseWordSchemaVersion: 1,
    });
  });

  it('clears stale schema freshness while a new validation is pending', async () => {
    const validateYaml = vi.fn().mockResolvedValueOnce({
      valid: true,
      errors: [],
      schemaFreshness: 'old',
      notices: ['This is an old Word structure.'],
    });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 300,
    });

    controller.handleTextChanged('yield:\n  lemma: legacy\n');
    await vi.advanceTimersByTimeAsync(300);
    expect(controller.state.schemaFreshness).toBe('old');

    controller.handleTextChanged('yield:\n  lemma: current\n');

    expect(controller.state.status).toBe('Checking YAML');
    expect(controller.state.schemaFreshness).toBeNull();
    expect(controller.state.notices).toEqual([]);
  });

  it('rejects stale validation responses from older YAML', async () => {
    let resolveFirst: (value: { valid: boolean; errors: string[] }) => void = () => {};
    const validateYaml = vi
      .fn()
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce({ valid: true, errors: [] });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 0,
    });

    controller.handleTextChanged('yield:\n  lemma: old\n');
    await vi.runOnlyPendingTimersAsync();

    controller.handleTextChanged('yield:\n  lemma: new\n');
    await vi.runOnlyPendingTimersAsync();

    resolveFirst({ valid: false, errors: ['old error'] });
    await Promise.resolve();

    expect(controller.state.status).toBe('Valid YAML');
    expect(controller.state.schemaErrors).toEqual([]);
  });

  it('asks strict validation for diagnostics when client parsing fails', async () => {
    const validateYaml = vi.fn().mockResolvedValue({
      valid: false,
      errors: ['YAML parse error.'],
      diagnostics: [{ code: 'yaml.parse_error', path: 'root', message: 'YAML parse error.' }],
    });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 0,
    });

    controller.handleTextChanged('yield:\n  lemma: "after\napplication:\n');
    await vi.runOnlyPendingTimersAsync();

    expect(validateYaml).toHaveBeenCalledWith({
      yaml: 'yield:\n  lemma: "after\napplication:\n',
      repair: false,
      intent: undefined,
      wordId: undefined,
    });
    expect(controller.state.status).toBe('Invalid YAML');
    expect(controller.state.schemaErrors).toEqual(['root: YAML parse error.']);
    expect(controller.state.notices).toEqual([]);
  });

  it('shows a local line diagnostic immediately when client YAML parsing fails', () => {
    const validateYaml = vi.fn();
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 300,
      parseYaml: () => {
        const error = new Error('can not read a block mapping entry (4:11)') as Error & {
          mark?: { line: number; column: number };
        };
        error.mark = { line: 3, column: 10 };
        throw error;
      },
    });

    controller.handleTextChanged('yield:\n  lemma: Sinn\nnuance:啊\n  synonyms:\n');

    expect(controller.state.status).toBe('Invalid YAML');
    expect(controller.state.schemaErrors).toEqual([
      'YAML parse error: can not read a block mapping entry (4:11)',
    ]);
    expect(controller.state.formatDiagnostics).toEqual([
      {
        code: 'yaml.parse_error',
        path: 'root',
        message: 'YAML parse error: can not read a block mapping entry (4:11)',
        line: 4,
      },
    ]);
  });

  it('shows schema diagnostics returned by strict validation', async () => {
    const validateYaml = vi.fn().mockResolvedValue({
      valid: false,
      errors: ['yield.lemma must match word'],
      diagnostics: [
        {
          code: 'schema.invalid',
          path: 'yield.lemma',
          message: 'yield.lemma must match word',
        },
      ],
    });
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 0,
    });

    controller.handleTextChanged('yield:\n  lemma: after\n');
    await vi.runOnlyPendingTimersAsync();

    expect(controller.state.status).toBe('Invalid YAML');
    expect(controller.state.schemaErrors).toEqual(['yield.lemma: yield.lemma must match word']);
    expect(controller.state.formatDiagnostics).toEqual([
      {
        code: 'schema.invalid',
        path: 'yield.lemma',
        message: 'yield.lemma must match word',
      },
    ]);
  });

  it('clears state for empty YAML', () => {
    const validateYaml = vi.fn();
    const controller = createWordEditorValidationController({ validateYaml });

    controller.handleTextChanged('   ');

    expect(controller.state.status).toBe('');
    expect(controller.state.schemaErrors).toEqual([]);
    expect(controller.state.formatDiagnostics).toEqual([]);
    expect(controller.state.validating).toBe(false);
    expect(validateYaml).not.toHaveBeenCalled();
  });
});
