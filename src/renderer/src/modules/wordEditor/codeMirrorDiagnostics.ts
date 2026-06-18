import type { Diagnostic as CodeMirrorDiagnostic } from '@codemirror/lint';
import type { FormatDiagnosticMessage } from './validationController';

type PathDiagnostic = FormatDiagnosticMessage & {
  line?: number;
  range?: { startLine?: number; endLine?: number };
};

interface YamlKeyLine {
  line: number;
  path: string;
}

function normalizeLine(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function lineFromMessage(diagnostic: FormatDiagnosticMessage): number | null {
  const duplicated = /duplicated at line (\d+)/i.exec(diagnostic.message);
  if (duplicated) return normalizeLine(Number(duplicated[1]));

  const line = /\bline (\d+)\b/i.exec(diagnostic.message);
  if (line) return normalizeLine(Number(line[1]));

  const yamlTuple = /\((\d+):\d+\)/.exec(diagnostic.message);
  return yamlTuple ? normalizeLine(Number(yamlTuple[1])) : null;
}

function collectYamlKeyLines(yamlText: string): YamlKeyLine[] {
  const stack: Array<{ indent: number; key: string }> = [];
  return yamlText.split('\n').flatMap((line, index) => {
    const match = /^(\s*)([A-Za-z0-9_-]+)\s*:/.exec(line);
    if (!match) return [];

    const indent = match[1].length;
    const key = match[2];
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ indent, key });

    return [
      {
        line: index + 1,
        path: stack.map(item => item.key).join('.'),
      },
    ];
  });
}

export function resolveDiagnosticLine(
  yamlText: string,
  diagnostic: FormatDiagnosticMessage
): number | null {
  const pathDiagnostic = diagnostic as PathDiagnostic;
  const explicitLine =
    normalizeLine(pathDiagnostic.line) ?? normalizeLine(pathDiagnostic.range?.startLine);
  if (explicitLine) return explicitLine;
  const messageLine = lineFromMessage(diagnostic);
  if (messageLine) return messageLine;
  const diagnosticPath =
    diagnostic.path && diagnostic.path !== 'root'
      ? diagnostic.path
      : inferPathFromMessage(diagnostic.message);
  if (!diagnosticPath) return null;

  const matches = collectYamlKeyLines(yamlText).filter(item => item.path === diagnosticPath);
  return matches.length === 1 ? matches[0].line : null;
}

function lineRange(yamlText: string, lineNumber: number): { from: number; to: number } | null {
  const lines = yamlText.split('\n');
  if (lineNumber < 1 || lineNumber > lines.length) return null;

  const from = lines.slice(0, lineNumber - 1).reduce((offset, line) => offset + line.length + 1, 0);
  const line = lines[lineNumber - 1] ?? '';
  return {
    from,
    to: from + Math.max(1, line.length),
  };
}

function diagnosticMessage(diagnostic: FormatDiagnosticMessage): string {
  return diagnostic.path ? `${diagnostic.path}: ${diagnostic.message}` : diagnostic.message;
}

function inferPathFromMessage(message: string): string | null {
  const match = /^([A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+)\b/.exec(message.trim());
  return match?.[1] ?? null;
}

export function formatDiagnosticsToCodeMirror(
  yamlText: string,
  diagnostics: FormatDiagnosticMessage[]
): CodeMirrorDiagnostic[] {
  return diagnostics.flatMap(diagnostic => {
    const line = resolveDiagnosticLine(yamlText, diagnostic);
    const range = line ? lineRange(yamlText, line) : null;
    if (!range) return [];

    return [
      {
        from: range.from,
        to: range.to,
        severity: 'error' as const,
        source: diagnostic.code,
        message: diagnosticMessage(diagnostic),
        markClass: 'cm-yaml-error-underline',
      },
    ];
  });
}
