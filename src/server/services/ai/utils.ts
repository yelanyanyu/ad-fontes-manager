type PlainObject = Record<string, unknown>;

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

module.exports = { deepMerge, stripMarkdownFences };
