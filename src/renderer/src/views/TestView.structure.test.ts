import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TestView', () => {
  it('hosts the CodeMirror YAML editor test bench', () => {
    const source = readFileSync(resolve(__dirname, 'TestView.vue'), 'utf8');

    expect(source).toContain(
      "import CodeMirrorYamlEditor from '@/components/WordEditor/CodeMirrorYamlEditor.vue'"
    );
    expect(source).toContain('<CodeMirrorYamlEditor v-model="yamlDraft"');
    expect(source).toContain('CodeMirror YAML');
  });
});
