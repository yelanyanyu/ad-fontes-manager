type PlainObject = Record<string, unknown>;

const yaml = require('js-yaml') as typeof import('js-yaml');

function isPlainObject(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge<T extends PlainObject, U extends PlainObject>(
  target: T,
  source: U
): T & U {
  const result: PlainObject = { ...target };

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key];
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue;
    }
  }

  return result as T & U;
}

export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  let result = trimmed;
  if (/^```(?:yaml|yml)\s*\n/i.test(result)) {
    result = result.replace(/^```(?:yaml|yml)\s*\n/i, '');
    const lastFence = result.lastIndexOf('\n```');
    if (lastFence !== -1) result = result.slice(0, lastFence);
  } else if (result.startsWith('```') && result.endsWith('```')) {
    result = result.slice(3, -3).trim();
  }
  return result.trim();
}

function escapeYamlDoubleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeUnescapedDoubleQuotes(value: string): string {
  let result = '';
  let backslashCount = 0;

  for (const char of value) {
    if (char === '"') {
      result += backslashCount % 2 === 1 ? '"' : '\\"';
      backslashCount = 0;
      continue;
    }

    result += char;
    backslashCount = char === '\\' ? backslashCount + 1 : 0;
  }

  return result;
}

function isBlockScalarStart(line: string): boolean {
  return /^(\s*[^:#\n][^:\n]*:\s*)[|>]/.test(line);
}

function getIndent(line: string): number {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function repairYamlLinesSafely(text: string, repairLine: (line: string) => string): string {
  const lines = text.split('\n');
  let inBlockScalar = false;
  let blockIndent = -1;

  return lines
    .map(line => {
      const indent = getIndent(line);
      const trimmed = line.trim();

      if (inBlockScalar) {
        if (trimmed === '') return line;
        if (indent > blockIndent) return line;
        inBlockScalar = false;
        blockIndent = -1;
      }

      if (isBlockScalarStart(line)) {
        inBlockScalar = true;
        blockIndent = indent;
        return line;
      }

      return repairLine(line);
    })
    .join('\n');
}

export function repairCommonYamlScalarSlips(text: string): string {
  return repairYamlLinesSafely(text, line => {
    const doubleQuotedWithTrailingText = line.match(
      /^(\s*[^:#\n][^:\n]*:\s*)"([^"\n]*)"\s+([^#\n]+?)(\s*(?:#.*)?)$/
    );
    if (doubleQuotedWithTrailingText) {
      const [, prefix, quotedValue, trailingText, comment = ''] = doubleQuotedWithTrailingText;
      const mergedValue = escapeYamlDoubleQuoted(`${quotedValue} ${trailingText.trim()}`);
      return `${prefix}"${mergedValue}"${comment}`;
    }

    const singleQuotedWithTrailingText = line.match(
      /^(\s*[^:#\n][^:\n]*:\s*)'([^'\n]*)'\s+([^#\n]+?)(\s*(?:#.*)?)$/
    );
    if (singleQuotedWithTrailingText) {
      const [, prefix, quotedValue, trailingText, comment = ''] = singleQuotedWithTrailingText;
      const mergedValue = escapeYamlDoubleQuoted(`${quotedValue} ${trailingText.trim()}`);
      return `${prefix}"${mergedValue}"${comment}`;
    }

    return line;
  });
}

export function repairLlmYamlQuirks(text: string): string {
  return repairYamlLinesSafely(text, line => {
    // Fix 0: ASCII YAML double quote opened, but the closing delimiter was
    // emitted as a Chinese smart quote.
    const smartClosingQuoteFix = line.match(/^(\s*[^:#\n][^:\n]*:\s*)"(.*)[”」](\s*(?:#.*)?)$/);
    if (smartClosingQuoteFix) {
      const [, prefix, inner, comment = ''] = smartClosingQuoteFix;
      return `${prefix}"${escapeUnescapedDoubleQuotes(inner)}"${comment}`;
    }

    // Fix 1: Double-quoted YAML scalar containing unescaped ASCII quotes inside.
    //        LLMs often emit Chinese quotemarks as ASCII " which breaks the
    //        YAML string, e.g. logic: "根词"sever(严格)"的身体感知"
    const dqFix = line.match(/^(\s*[^:#\n][^:\n]*:\s*)"(.*)"(\s*(?:#.*)?)$/);
    if (dqFix) {
      const [, prefix, inner, comment = ''] = dqFix;
      const fixedInner = escapeUnescapedDoubleQuotes(inner);
      if (fixedInner !== inner) {
        return `${prefix}"${fixedInner}"${comment}`;
      }
      return line;
    }

    const match = line.match(/^(\s*[^:#\n][^:\n]*:\s*)([^#\n]*?)(\s*(?:#.*)?)$/);
    if (!match) return line;

    const [, prefix, rawValue, comment = ''] = match;
    const value = rawValue.trim();
    if (!value) return line;
    if (/^(["'{[]|[|>]|!|&)/.test(value)) return line;

    const startsWithAliasLikeStar = /^\*\S+/.test(value);
    const containsColonSpace = /:\s/.test(value);
    if (!startsWithAliasLikeStar && !containsColonSpace) return line;

    return `${prefix}"${escapeYamlDoubleQuoted(value)}"${comment}`;
  });
}

export function loadYamlObjectWithRepairs(text: string): Record<string, unknown> {
  try {
    return yaml.load(text) as Record<string, unknown>;
  } catch (firstError) {
    const pass1 = repairLlmYamlQuirks(text);
    if (pass1 !== text) {
      try {
        return yaml.load(pass1) as Record<string, unknown>;
      } catch {
        // Continue to pass 2.
      }
    }

    const pass2 = repairCommonYamlScalarSlips(pass1);
    if (pass2 !== pass1) {
      try {
        return yaml.load(pass2) as Record<string, unknown>;
      } catch {
        // Prefer the original parser error; the repair attempt failed too.
      }
    }

    throw firstError;
  }
}

export function mergeYamlTexts(primaryYaml: string, overlayYaml: string): string {
  const primary = loadYamlObjectWithRepairs(primaryYaml);
  const overlay = loadYamlObjectWithRepairs(overlayYaml);
  delete overlay.ad_fontes;
  const merged = deepMerge(primary, overlay);
  return yaml.dump(merged, { lineWidth: -1, noRefs: true });
}

module.exports = {
  deepMerge,
  stripMarkdownFences,
  repairCommonYamlScalarSlips,
  repairLlmYamlQuirks,
  loadYamlObjectWithRepairs,
  mergeYamlTexts,
};
