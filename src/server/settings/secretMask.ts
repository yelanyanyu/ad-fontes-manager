// Secret mask helpers 统一处理本地 secret 的展示占位和 masked 输入保留逻辑。
export interface SecretMaskOptions {
  visiblePrefix?: number;
  visibleSuffix?: number;
  minimumLengthToReveal?: number;
}

const DEFAULT_SECRET_MASK: Required<SecretMaskOptions> = {
  visiblePrefix: 3,
  visibleSuffix: 4,
  minimumLengthToReveal: 9,
};

// 判断传入值是否是 UI/API 返回的 masked 占位，而不是真实 secret。
export function containsMask(value: string): boolean {
  return value.includes('***');
}

// 生成统一 masked 文本；provider 可露出前缀，search 只露出后缀。
export function maskSecret(value: string, options: SecretMaskOptions = {}): string {
  if (!value) return '';

  const visiblePrefix = options.visiblePrefix ?? DEFAULT_SECRET_MASK.visiblePrefix;
  const visibleSuffix = options.visibleSuffix ?? DEFAULT_SECRET_MASK.visibleSuffix;
  const minimumLengthToReveal =
    options.minimumLengthToReveal ?? DEFAULT_SECRET_MASK.minimumLengthToReveal;
  if (value.length < minimumLengthToReveal) return '***';

  return `${value.slice(0, visiblePrefix)}***${value.slice(-visibleSuffix)}`;
}

// 保存配置时遇到 masked 输入，用现有 raw secret 替换，避免把占位符写坏本地 key。
export function preserveMaskedSecret(inputSecret: string, existingSecret?: string): string {
  if (!containsMask(inputSecret)) return inputSecret;
  return existingSecret && !containsMask(existingSecret) ? existingSecret : '';
}

// 测试连接时遇到 masked 输入，用本地 raw secret 发请求；新输入仍原样使用。
export function resolveMaskedSecretForUse(inputSecret: string, existingSecret?: string): string {
  if (!containsMask(inputSecret) && inputSecret) return inputSecret;
  return existingSecret || inputSecret;
}
