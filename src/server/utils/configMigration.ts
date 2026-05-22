import { CURRENT_CONFIG_SCHEMA_VERSION, getDefaultAppConfig } from './defaultAppConfig';
import type { ConfigObject } from './defaultAppConfig';

interface MigrationResult {
  config: ConfigObject;
  changed: boolean;
}

function isPlainObject(value: unknown): value is ConfigObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeDefaults(defaults: ConfigObject, userConfig: ConfigObject): ConfigObject {
  const result: ConfigObject = { ...defaults };

  for (const [key, value] of Object.entries(userConfig)) {
    const defaultValue = result[key];
    if (isPlainObject(defaultValue) && isPlainObject(value)) {
      result[key] = deepMergeDefaults(defaultValue, value);
      continue;
    }
    result[key] = value;
  }

  return result;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(flattenKeys(value)).sort());
}

function flattenKeys(value: unknown, keys: Record<string, true> = {}): Record<string, true> {
  if (!isPlainObject(value) && !Array.isArray(value)) return keys;
  if (Array.isArray(value)) {
    for (const item of value) flattenKeys(item, keys);
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys[key] = true;
    flattenKeys(child, keys);
  }
  return keys;
}

export function migrateUserConfig(input: ConfigObject): MigrationResult {
  const withDefaults = deepMergeDefaults(getDefaultAppConfig(), input);
  withDefaults.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION;

  return {
    config: withDefaults,
    changed: stableStringify(withDefaults) !== stableStringify(input),
  };
}
