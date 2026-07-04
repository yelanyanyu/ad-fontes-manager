import type { Diagnostic as CodeMirrorDiagnostic } from '@codemirror/lint';
import type { FormatDiagnosticMessage } from './validationController';

// 把后端返回的词条结构诊断转换成 CodeMirror 可以画下划线的位置。
// 这里尽量相信后端给出的 anchorPath，只在没有定位信息时才从文案里猜。
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

function extractYamlKey(line: string): { indent: number; key: string } | null {
  const indent = line.length - line.trimStart().length;
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const content = trimmed.startsWith('- ') ? trimmed.slice(2).trimStart() : trimmed;
  // YAML 普通 key 可以包含冒号；真正分隔 key/value 的冒号后面会跟空白或行尾。
  // 这样 `historical_origins:abc:` 会被当成完整 key，而不是误认成 `historical_origins`。
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== ':') continue;
    const next = content[index + 1];
    if (next !== undefined && !/\s/.test(next)) continue;

    const key = content
      .slice(0, index)
      .trim()
      .replace(/^["']|["']$/g, '');
    return key ? { indent, key } : null;
  }

  return null;
}

function collectYamlKeyLines(yamlText: string): YamlKeyLine[] {
  const stack: Array<{ indent: number; key: string }> = [];
  return yamlText.split('\n').flatMap((line, index) => {
    const keyInfo = extractYamlKey(line);
    if (!keyInfo) return [];

    const { indent, key } = keyInfo;
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
    pathDiagnostic.anchorPath ||
    (diagnostic.path && diagnostic.path !== 'root'
      ? diagnostic.path
      : inferPathFromMessage(diagnostic.message));
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
  const body = diagnostic.suggestion
    ? `${diagnostic.message} ${diagnostic.suggestion}`
    : diagnostic.message;
  return diagnostic.path ? `${diagnostic.path}: ${body}` : body;
}

function diagnosticMarkClass(diagnostic: FormatDiagnosticMessage): string {
  return diagnostic.code.startsWith('schema.')
    ? 'cm-yaml-schema-underline'
    : 'cm-yaml-error-underline';
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
        markClass: diagnosticMarkClass(diagnostic),
      },
    ];
  });
}
