import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CodeMirror YAML editor rollout boundary', () => {
  it('uses CodeMirror as the only production WordEditor editing surface', () => {
    const wordEditor = readFileSync(resolve(__dirname, 'WordEditor.vue'), 'utf8');

    expect(wordEditor).toContain(
      "import CodeMirrorYamlEditor from '@/components/WordEditor/CodeMirrorYamlEditor.vue'"
    );
    expect(wordEditor).toContain('<CodeMirrorYamlEditor');
    expect(wordEditor).not.toContain('YamlEditorSurface');
    expect(wordEditor).not.toContain('line-depths');
    expect(wordEditor).not.toContain('cursor-line');
    expect(wordEditor).not.toContain('scheduleLineMeasure');
  });

  it('provides a dedicated CodeMirror YAML component for the test route', () => {
    const source = readFileSync(resolve(__dirname, 'CodeMirrorYamlEditor.vue'), 'utf8');

    expect(source).toContain("from 'codemirror'");
    expect(source).toContain("from '@codemirror/lang-yaml'");
    expect(source).toContain("from '@codemirror/lint'");
    expect(source).toContain('yaml()');
    expect(source).toContain("emit('update:modelValue'");
    expect(source).toContain('cm-yaml-error-underline');
    expect(source).not.toContain('lineDepths');
    expect(source).not.toContain('scheduleLineMeasure');
  });
});
