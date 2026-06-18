import { computed, type ComputedRef, type Ref } from 'vue';

export interface BreadcrumbSegment {
  key: string;
  isListItem?: boolean;
}

function getLeadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function isCommentLine(line: string): boolean {
  return line.trim().startsWith('#');
}

function isListItem(line: string): boolean {
  return line.trim().startsWith('- ');
}

function extractKey(line: string): string | null {
  let content = line.trimStart();
  if (content.startsWith('- ')) {
    content = content.slice(2);
  }
  const match = content.match(/^([a-zA-Z_]\w*)\s*:/);
  return match ? match[1] : null;
}

export function useYamlHierarchy(
  text: Ref<string>,
  cursorOffset: Ref<number>,
  indentUnit = 2
): {
  breadcrumbPath: ComputedRef<BreadcrumbSegment[]>;
} {
  const lines = computed(() => text.value.split('\n'));

  const cursorLine = computed(() => {
    const before = text.value.slice(0, cursorOffset.value);
    return before.split('\n').length - 1;
  });

  const breadcrumbPath = computed<BreadcrumbSegment[]>(() => {
    const allLines = lines.value;
    const cur = cursorLine.value;

    if (allLines.length === 0 || cur < 0 || cur >= allLines.length) return [];

    const currentLine = allLines[cur];
    if (isBlankLine(currentLine) || isCommentLine(currentLine)) return [];

    const path: BreadcrumbSegment[] = [];

    const currentKey = extractKey(currentLine);
    const currentIsListItem = isListItem(currentLine);

    if (currentKey) {
      path.unshift({ key: currentKey, isListItem: currentIsListItem });
    } else if (currentIsListItem) {
      path.unshift({ key: '(item)', isListItem: true });
    }

    const currentDepth = Math.floor(getLeadingSpaces(currentLine) / indentUnit);
    let targetDepth: number;
    if (currentKey || currentIsListItem) {
      targetDepth = currentDepth;
    } else {
      targetDepth = currentDepth;
    }

    for (let i = cur - 1; i >= 0; i--) {
      const line = allLines[i];
      if (isBlankLine(line) || isCommentLine(line)) continue;

      const indent = Math.floor(getLeadingSpaces(line) / indentUnit);
      if (indent < targetDepth) {
        const key = extractKey(line);
        if (key) {
          path.unshift({ key, isListItem: isListItem(line) });
          targetDepth = indent;
          if (indent === 0) break;
        }
      }
    }

    return path;
  });

  return { breadcrumbPath };
}
