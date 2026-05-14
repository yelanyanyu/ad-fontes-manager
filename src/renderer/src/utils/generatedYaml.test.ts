import { describe, expect, it } from 'vitest';
import { prepareGeneratedYamlForSave } from './generatedYaml';

describe('generatedYaml', () => {
  it('strips yaml markdown fences before saving', () => {
    const result = prepareGeneratedYamlForSave('```yaml\nyield:\n  lemma: feasible\n```');

    expect(result).toEqual({
      ok: true,
      yaml: 'yield:\n  lemma: feasible',
    });
  });

  it('repairs common quoted scalar slips before validation', () => {
    const result = prepareGeneratedYamlForSave('yield:\n  lemma: "feasible" extra text');

    expect(result).toEqual({
      ok: true,
      yaml: 'yield:\n  lemma: "feasible extra text"',
    });
  });

  it('reports invalid yaml after repair attempts', () => {
    const result = prepareGeneratedYamlForSave('yield:\n  lemma: [unterminated');

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
