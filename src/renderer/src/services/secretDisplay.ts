// Secret display helpers 让“已保存的 masked 占位符”和“用户输入的新明文”在 UI 中显式分开。
export const isMaskedSecret = (value: string | undefined): boolean =>
  Boolean(value?.includes('***'));

export const canRevealSecret = (value: string | undefined): boolean =>
  Boolean(value) && !isMaskedSecret(value);

export const getSecretInputType = (
  value: string | undefined,
  requestedVisible: boolean | undefined
): 'password' | 'text' => (requestedVisible && canRevealSecret(value) ? 'text' : 'password');

export const getSecretToggleTitle = (requestedVisible: boolean | undefined): string => {
  return requestedVisible ? '隐藏' : '查看';
};

export const getNextSecretVisibility = (
  value: string | undefined,
  currentVisible: boolean | undefined
): boolean => (canRevealSecret(value) ? !currentVisible : true);
