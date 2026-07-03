import { describe, expect, it } from 'vitest';
import { formatDiagnosticsToCodeMirror, resolveDiagnosticLine } from './codeMirrorDiagnostics';

describe('CodeMirror diagnostics', () => {
  const yamlText = `yield:
  lemma: above
  language: en
application:
  meaning: higher than
`;

  it('uses explicit line information when diagnostics provide it', () => {
    const line = resolveDiagnosticLine(yamlText, {
      code: 'yaml.unclosed_quote',
      message: 'Unclosed quote',
      line: 2,
    });

    expect(line).toBe(2);
  });

  it('maps path-only diagnostics to a matching YAML key when reliable', () => {
    const line = resolveDiagnosticLine(yamlText, {
      code: 'schema.invalid',
      path: 'yield.lemma',
      message: 'Lemma is required',
    });

    expect(line).toBe(2);
  });

  it('uses line numbers embedded in parse diagnostic messages', () => {
    const line = resolveDiagnosticLine(yamlText, {
      code: 'yaml.unclosed_quote',
      path: 'yield.lemma',
      message: 'Line 2 has a double-quoted value closed with a smart quote at yield.lemma.',
    });

    expect(line).toBe(2);
  });

  it('uses js-yaml line and column tuples embedded in parse diagnostic messages', () => {
    const line = resolveDiagnosticLine(yamlText, {
      code: 'yaml.parse_error',
      path: 'root',
      message: 'YAML parse error: can not read a block mapping entry (4:11)',
    });

    expect(line).toBe(4);
  });

  it('maps root schema diagnostics when the message starts with a YAML path', () => {
    const line = resolveDiagnosticLine(yamlText, {
      code: 'schema.invalid',
      path: 'root',
      message: 'yield.lemma must match word',
    });

    expect(line).toBe(2);
  });

  it('marks the duplicated line for duplicate-key diagnostics', () => {
    const line = resolveDiagnosticLine(yamlText, {
      code: 'yaml.duplicate_key',
      path: 'yield.lemma',
      message: 'Duplicate YAML key "lemma": first seen at line 2, duplicated at line 5.',
    });

    expect(line).toBe(5);
  });

  it('does not invent a line for path-only diagnostics that cannot be mapped', () => {
    const line = resolveDiagnosticLine(yamlText, {
      code: 'schema.invalid',
      path: 'yield.definition.text',
      message: 'Definition is required',
    });

    expect(line).toBeNull();
  });

  it('builds CodeMirror lint diagnostics without mutating YAML text', () => {
    const before = yamlText;
    const diagnostics = formatDiagnosticsToCodeMirror(yamlText, [
      {
        code: 'schema.invalid',
        path: 'application.meaning',
        message: 'Meaning is too short',
      },
      {
        code: 'schema.invalid',
        path: 'missing.path',
        message: 'Missing path',
      },
    ]);

    expect(yamlText).toBe(before);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toBe('application.meaning: Meaning is too short');
  });

  it('marks YAML syntax diagnostics with the red editor class', () => {
    const diagnostics = formatDiagnosticsToCodeMirror(yamlText, [
      {
        code: 'yaml.parse_error',
        path: 'yield.lemma',
        message: 'YAML parse error',
      },
    ]);

    expect(diagnostics[0]?.markClass).toBe('cm-yaml-error-underline');
  });

  it('marks Word Schema diagnostics with the amber editor class', () => {
    const diagnostics = formatDiagnosticsToCodeMirror(yamlText, [
      {
        code: 'schema.invalid',
        path: 'yield.lemma',
        message: 'Lemma is required',
      },
    ]);

    expect(diagnostics[0]?.markClass).toBe('cm-yaml-schema-underline');
  });
});
