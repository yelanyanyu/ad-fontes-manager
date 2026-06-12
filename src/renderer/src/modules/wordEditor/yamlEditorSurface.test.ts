import { describe, expect, it } from 'vitest';

import { applyYamlEditorTab } from './yamlEditorSurface';

describe('applyYamlEditorTab', () => {
  it('inserts two spaces for a collapsed Tab selection', () => {
    const result = applyYamlEditorTab({
      value: 'yield:\nlemma: apple\n',
      selectionStart: 7,
      selectionEnd: 7,
      shiftKey: false,
    });

    expect(result).toEqual({
      value: 'yield:\n  lemma: apple\n',
      selectionStart: 9,
      selectionEnd: 9,
    });
  });

  it('indents every selected line and preserves the selection span', () => {
    const value = 'yield:\nlemma: apple\npart_of_speech: noun\n';
    const result = applyYamlEditorTab({
      value,
      selectionStart: 7,
      selectionEnd: 41,
      shiftKey: false,
    });

    expect(result).toEqual({
      value: 'yield:\n  lemma: apple\n  part_of_speech: noun\n',
      selectionStart: 9,
      selectionEnd: 45,
    });
  });

  it('outdents every selected line on Shift+Tab', () => {
    const value = 'yield:\n  lemma: apple\n  part_of_speech: noun\n';
    const result = applyYamlEditorTab({
      value,
      selectionStart: 9,
      selectionEnd: 45,
      shiftKey: true,
    });

    expect(result).toEqual({
      value: 'yield:\nlemma: apple\npart_of_speech: noun\n',
      selectionStart: 7,
      selectionEnd: 41,
    });
  });
});
