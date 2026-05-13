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

export function repairCommonYamlScalarSlips(text: string): string {
  return text
    .split('\n')
    .map(line => {
      const doubleQuotedWithTrailingText = line.match(
        /^(\s*[^:#\n][^:\n]*:\s*)"([^"\n]*)"\s+([^#\n]+?)(\s*(?:#.*)?)$/
      );
      if (doubleQuotedWithTrailingText) {
        const [, prefix, quotedValue, trailingText, comment = ''] = doubleQuotedWithTrailingText;
        const mergedValue = `${quotedValue} ${trailingText.trim()}`.replace(/"/g, '\\"');
        return `${prefix}"${mergedValue}"${comment}`;
      }

      const singleQuotedWithTrailingText = line.match(
        /^(\s*[^:#\n][^:\n]*:\s*)'([^'\n]*)'\s+([^#\n]+?)(\s*(?:#.*)?)$/
      );
      if (singleQuotedWithTrailingText) {
        const [, prefix, quotedValue, trailingText, comment = ''] = singleQuotedWithTrailingText;
        const mergedValue = `${quotedValue} ${trailingText.trim()}`.replace(/"/g, '\\"');
        return `${prefix}"${mergedValue}"${comment}`;
      }

      return line;
    })
    .join('\n');
}

export function loadYamlObjectWithRepairs(text: string): Record<string, unknown> {
  try {
    return yaml.load(text) as Record<string, unknown>;
  } catch (firstError) {
    const repaired = repairCommonYamlScalarSlips(text);
    if (repaired === text) throw firstError;
    return yaml.load(repaired) as Record<string, unknown>;
  }
}

export function mergeYamlTexts(primaryYaml: string, overlayYaml: string): string {
  const primary = loadYamlObjectWithRepairs(primaryYaml);
  const overlay = loadYamlObjectWithRepairs(overlayYaml);
  const merged = deepMerge(primary, overlay);
  return yaml.dump(merged, { lineWidth: -1, noRefs: true });
}

module.exports = {
  deepMerge,
  stripMarkdownFences,
  repairCommonYamlScalarSlips,
  loadYamlObjectWithRepairs,
  mergeYamlTexts,
};
