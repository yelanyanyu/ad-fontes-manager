import yaml from 'js-yaml';

export interface PreparedGeneratedYaml {
  ok: boolean;
  yaml?: string;
  error?: string;
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

export function prepareGeneratedYamlForSave(text: string): PreparedGeneratedYaml {
  const repaired = repairCommonYamlScalarSlips(stripMarkdownFences(text));
  try {
    yaml.load(repaired);
    return { ok: true, yaml: repaired };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid YAML',
    };
  }
}
