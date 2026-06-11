import yaml from 'js-yaml';

const APP_METADATA_KEY = 'ad_fontes';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const stripWordAppMetadata = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  const next = { ...value };
  delete next[APP_METADATA_KEY];
  return next;
};

export const hideWordAppMetadataInYaml = (yamlText: string): string => {
  try {
    const parsed = yaml.load(yamlText);
    if (!isRecord(parsed) || parsed[APP_METADATA_KEY] === undefined) return yamlText;
    return yaml.dump(stripWordAppMetadata(parsed), {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
  } catch {
    return yamlText;
  }
};
