import { describe, expect, it, vi } from 'vitest';

import { createFormatFixCommand } from './formatFixCommand';
import type { WordEditorValidationState } from './validationController';

const makeState = (): WordEditorValidationState => ({
  status: '',
  schemaErrors: [],
  validating: false,
});

describe('createFormatFixCommand', () => {
  it('applies safe repaired YAML returned by Basic Format Fix', async () => {
    const state = makeState();
    const replaceYaml = vi.fn();
    const addToast = vi.fn();
    const repairYaml = vi.fn().mockResolvedValue({
      valid: true,
      changed: true,
      yaml: 'yield:\n  lemma: after\n',
      repairs: [{ type: 'syntax', message: 'Repaired common YAML scalar formatting slips.' }],
      errors: [],
    });
    const command = createFormatFixCommand({ state, repairYaml, replaceYaml, addToast });

    const result = await command.run('bad yaml');

    expect(result.status).toBe('repaired');
    expect(repairYaml).toHaveBeenCalledWith({ yaml: 'bad yaml' });
    expect(replaceYaml).toHaveBeenCalledWith('yield:\n  lemma: after\n');
    expect(state.status).toBe('Valid YAML');
    expect(state.schemaErrors).toEqual(['Repaired common YAML scalar formatting slips.']);
    expect(addToast).toHaveBeenCalledWith('Format repaired.', 'success');
  });

  it('applies partial repaired YAML while keeping validation invalid', async () => {
    const state = makeState();
    const replaceYaml = vi.fn();
    const addToast = vi.fn();
    const repairYaml = vi.fn().mockResolvedValue({
      valid: false,
      changed: true,
      yaml: 'partly repaired yaml',
      diagnostics: [{ code: 'section.missing', path: 'nuance', message: 'nuance is missing.' }],
      errors: ['nuance is missing.'],
    });
    const command = createFormatFixCommand({ state, repairYaml, replaceYaml, addToast });

    const result = await command.run('bad yaml');

    expect(result.status).toBe('partiallyRepaired');
    expect(replaceYaml).toHaveBeenCalledWith('partly repaired yaml');
    expect(state.status).toBe('Invalid YAML');
    expect(state.schemaErrors).toEqual(['nuance: nuance is missing.']);
    expect(addToast).toHaveBeenCalledWith(
      'Format partly repaired; remaining errors need review.',
      'warning'
    );
  });

  it('does not replace visible YAML when no safe repair is returned', async () => {
    const state = makeState();
    const replaceYaml = vi.fn();
    const addToast = vi.fn();
    const repairYaml = vi.fn().mockResolvedValue({
      valid: false,
      changed: false,
      diagnostics: [{ code: 'yaml.parse_error', path: 'root', message: 'YAML parse error.' }],
      errors: ['YAML parse error.'],
    });
    const command = createFormatFixCommand({ state, repairYaml, replaceYaml, addToast });

    const result = await command.run('bad yaml');

    expect(result.status).toBe('notRepaired');
    expect(replaceYaml).not.toHaveBeenCalled();
    expect(state.status).toBe('Invalid YAML');
    expect(state.schemaErrors).toEqual(['root: YAML parse error.']);
    expect(addToast).toHaveBeenCalledWith('No safe automatic repair was available.', 'warning');
  });

  it('only replaces YAML when the response includes changed YAML text', async () => {
    const state = makeState();
    const replaceYaml = vi.fn();
    const addToast = vi.fn();
    const repairYaml = vi.fn().mockResolvedValue({
      valid: true,
      changed: true,
      errors: [],
    });
    const command = createFormatFixCommand({ state, repairYaml, replaceYaml, addToast });

    await command.run('already ok');

    expect(replaceYaml).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('No format repairs needed.', 'info');
  });
});
