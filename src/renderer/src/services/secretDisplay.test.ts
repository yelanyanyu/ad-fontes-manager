import { describe, expect, it } from 'vitest';

import {
  canRevealSecret,
  getNextSecretVisibility,
  getSecretInputType,
  getSecretToggleTitle,
  isMaskedSecret,
} from './secretDisplay';

describe('secretDisplay', () => {
  it('keeps a masked saved key hidden until an explicit reveal replaces it with raw text', () => {
    const maskedKey = 'sk-***7339';

    expect(isMaskedSecret(maskedKey)).toBe(true);
    expect(canRevealSecret(maskedKey)).toBe(false);
    expect(getSecretInputType(maskedKey, true)).toBe('password');
    expect(getNextSecretVisibility(maskedKey, false)).toBe(true);
    expect(getSecretToggleTitle(false)).toBe('查看');
  });

  it('reveals only newly typed plain keys', () => {
    const plainKey = 'sk-user-typed-7339';

    expect(canRevealSecret(plainKey)).toBe(true);
    expect(getSecretInputType(plainKey, true)).toBe('text');
    expect(getNextSecretVisibility(plainKey, false)).toBe(true);
    expect(getSecretToggleTitle(true)).toBe('隐藏');
  });

  it('uses text input after the explicit reveal replaces the masked key with a raw key', () => {
    expect(getSecretInputType('sk-real-provider-7339', true)).toBe('text');
  });
});
