export interface YamlEditorSelection {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  shiftKey: boolean;
}

export interface YamlEditorEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const INDENT = '  ';

export function applyYamlEditorTab({
  value,
  selectionStart,
  selectionEnd,
  shiftKey,
}: YamlEditorSelection): YamlEditorEditResult {
  if (!shiftKey && selectionStart === selectionEnd) {
    const nextValue = value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd);
    const nextCursor = selectionStart + INDENT.length;
    return {
      value: nextValue,
      selectionStart: nextCursor,
      selectionEnd: nextCursor,
    };
  }

  const lines = value.split('\n');
  const startLine = value.slice(0, selectionStart).split('\n').length - 1;
  const effectiveSelectionEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
      ? selectionEnd - 1
      : selectionEnd;
  const endLine = value.slice(0, effectiveSelectionEnd).split('\n').length - 1;
  let nextSelectionStart = selectionStart;
  let nextSelectionEnd = selectionEnd;

  for (let i = startLine; i <= endLine; i += 1) {
    const line = lines[i];
    if (!shiftKey) {
      lines[i] = INDENT + line;
      if (i === startLine) nextSelectionStart += INDENT.length;
      nextSelectionEnd += INDENT.length;
      continue;
    }

    const leadingSpaces = line.length - line.trimStart().length;
    const removeCount = Math.min(leadingSpaces, INDENT.length);
    if (removeCount > 0) {
      lines[i] = line.slice(removeCount);
      if (i === startLine) nextSelectionStart = Math.max(0, nextSelectionStart - removeCount);
      nextSelectionEnd = Math.max(0, nextSelectionEnd - removeCount);
    }
  }

  return {
    value: lines.join('\n'),
    selectionStart: nextSelectionStart,
    selectionEnd: Math.max(nextSelectionStart, nextSelectionEnd),
  };
}
