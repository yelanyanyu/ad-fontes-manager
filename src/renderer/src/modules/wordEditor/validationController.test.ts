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
    });
    expect(controller.state.status).toBe('Valid YAML');
    expect(controller.state.schemaErrors).toEqual([]);
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

  it('marks parse errors invalid without calling the server', async () => {
    const validateYaml = vi.fn();
    const controller = createWordEditorValidationController({
      validateYaml,
      inputDebounceMs: 0,
      serverDebounceMs: 0,
    });

    controller.handleTextChanged('yield:\n  lemma: "after\napplication:\n');
    await vi.runOnlyPendingTimersAsync();

    expect(validateYaml).not.toHaveBeenCalled();
    expect(controller.state.status).toBe('Invalid YAML');
    expect(controller.state.schemaErrors).toEqual([]);
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
  });

  it('clears state for empty YAML', () => {
    const validateYaml = vi.fn();
    const controller = createWordEditorValidationController({ validateYaml });

    controller.handleTextChanged('   ');

    expect(controller.state.status).toBe('');
    expect(controller.state.schemaErrors).toEqual([]);
    expect(controller.state.validating).toBe(false);
    expect(validateYaml).not.toHaveBeenCalled();
  });
});
