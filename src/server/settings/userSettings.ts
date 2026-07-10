import fs from 'node:fs';
import path from 'node:path';

import { migrateUserConfig } from '../utils/configMigration';
import type { ConfigObject } from '../utils/defaultAppConfig';

// User Settings module 是用户设置的公开 seam；当前先保持旧 config.json 形状不变。
type Primitive = string | number | boolean | null;
type UserSettingsValue = Primitive | UserSettingsPatch | UserSettingsValue[];

export interface UserSettingsPatch {
  [key: string]: UserSettingsValue | undefined;
}

export interface UserSettingsSnapshot {
  config: ConfigObject;
}

interface UserSettingsStoreRead {
  value: unknown;
  canWriteMigrated: boolean;
}

export interface UserSettingsStoreAdapter {
  readRaw(): UserSettingsStoreRead;
  writeRaw(config: ConfigObject): void;
}

export interface UserSettingsModule {
  readSnapshot(): UserSettingsSnapshot;
  readMaskedSnapshot(): UserSettingsSnapshot;
  updateSettings(patch: UserSettingsPatch): UserSettingsSnapshot;
}

interface FileSettingsAdapterOptions {
  configPath?: string;
}

interface UserSettingsModuleOptions {
  adapter: UserSettingsStoreAdapter;
}

// 判断普通对象，避免数组和 null 被当成可递归合并的设置块。
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// 返回快照副本，调用方不能通过引用改到模块内部的结果。
function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// File adapter 默认尊重 ADFONTES_CONFIG_PATH，保留 standalone 和调试路径。
function resolveFileSettingsPath(options: FileSettingsAdapterOptions): string {
  if (options.configPath) return options.configPath;
  if (process.env.ADFONTES_CONFIG_PATH) return process.env.ADFONTES_CONFIG_PATH;
  return path.join(process.cwd(), 'config.json');
}

// 读取 UTF-8 JSON；坏文件只回落到默认输出，不在读取时覆盖用户原文件。
function readJsonObject(configPath: string): UserSettingsStoreRead {
  if (!fs.existsSync(configPath)) {
    return { value: {}, canWriteMigrated: false };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed)
      ? { value: parsed, canWriteMigrated: true }
      : { value: {}, canWriteMigrated: false };
  } catch {
    return { value: {}, canWriteMigrated: false };
  }
}

// 保存前尽力备份旧文件；备份失败不能阻塞用户设置写入。
function backupExistingConfig(configPath: string): void {
  if (!fs.existsSync(configPath)) return;

  try {
    fs.copyFileSync(configPath, `${configPath}.bak`);
  } catch {
    // 备份失败不应阻断当前设置保存；真实写入仍通过临时文件保证完整性。
  }
}

// 通过临时文件和 rename 写入，避免半截 JSON 留在用户设置文件里。
function writeJsonAtomically(configPath: string, config: ConfigObject): void {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  const tmpPath = `${configPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  backupExistingConfig(configPath);
  fs.renameSync(tmpPath, configPath);
}

// 合并调用方传入的用户设置 patch；对象递归，普通值直接覆盖。
function mergeSettingsPatch(config: ConfigObject, patch: UserSettingsPatch): ConfigObject {
  const result: ConfigObject = { ...config };

  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue;

    const currentValue = result[key];
    if (isPlainObject(currentValue) && isPlainObject(patchValue)) {
      result[key] = mergeSettingsPatch(
        currentValue as ConfigObject,
        patchValue as UserSettingsPatch
      );
      continue;
    }

    result[key] = patchValue as ConfigObject[string];
  }

  return result;
}

// 统一经过现有迁移规则，保证输出和旧 runtime config 读取保持一致。
function normalizeUserSettings(input: unknown): { config: ConfigObject; changed: boolean } {
  const rawConfig = isPlainObject(input) ? (input as ConfigObject) : {};
  return migrateUserConfig(rawConfig);
}

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '***';
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}***${suffix}`;
}

function maskSearchApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '***';
  return `***${key.slice(-4)}`;
}

// 生成可给 renderer/API 使用的快照；本地 secret 只在 raw snapshot 中保留。
function maskUserSettings(config: ConfigObject): ConfigObject {
  const masked = cloneConfig(config);
  const ai = masked.ai;
  if (!isPlainObject(ai)) return masked;

  const providers = ai.providers;
  if (Array.isArray(providers)) {
    ai.providers = providers.map(provider =>
      isPlainObject(provider) && typeof provider.apiKey === 'string'
        ? { ...provider, apiKey: maskApiKey(provider.apiKey) }
        : provider
    ) as ConfigObject[string];
  }

  const search = ai.search;
  if (isPlainObject(search) && typeof search.apiKey === 'string') {
    ai.search = { ...search, apiKey: maskSearchApiKey(search.apiKey) } as ConfigObject[string];
  }

  return masked;
}

// 创建文件适配器；它是 User Settings seam 下第一个真实 adapter。
export function createFileSettingsAdapter(
  options: FileSettingsAdapterOptions = {}
): UserSettingsStoreAdapter {
  const configPath = resolveFileSettingsPath(options);

  return {
    readRaw(): UserSettingsStoreRead {
      return readJsonObject(configPath);
    },

    writeRaw(config: ConfigObject): void {
      writeJsonAtomically(configPath, config);
    },
  };
}

// 创建 User Settings module；调用方只看快照和命令，不再知道文件布局。
export function createUserSettingsModule(options: UserSettingsModuleOptions): UserSettingsModule {
  // 每次读取都先迁移，避免旧形状和默认值差异泄漏给调用方。
  const readMigratedConfig = (): ConfigObject => {
    const raw = options.adapter.readRaw();
    const migration = normalizeUserSettings(raw.value);
    if (migration.changed && raw.canWriteMigrated) {
      options.adapter.writeRaw(migration.config);
    }
    return migration.config;
  };

  return {
    // 读取当前用户设置快照，必要时把迁移后的形状写回 adapter。
    readSnapshot(): UserSettingsSnapshot {
      return { config: cloneConfig(readMigratedConfig()) };
    },

    // 读取对外安全快照；保留结构和默认值，但隐藏本地 secret。
    readMaskedSnapshot(): UserSettingsSnapshot {
      return { config: maskUserSettings(readMigratedConfig()) };
    },

    // 更新用户设置并重新迁移，保证保存输出和读取输出是一种形状。
    updateSettings(patch: UserSettingsPatch): UserSettingsSnapshot {
      const merged = mergeSettingsPatch(readMigratedConfig(), patch);
      const migration = normalizeUserSettings(merged);
      options.adapter.writeRaw(migration.config);
      return { config: cloneConfig(migration.config) };
    },
  };
}
