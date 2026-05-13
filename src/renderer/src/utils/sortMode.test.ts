import { describe, expect, it } from 'vitest';

import { isSortMode } from './sortMode';

describe('isSortMode', () => {
  it('accepts modified-time sort modes used by the word list toolbar', () => {
    expect(isSortMode('updated-newest')).toBe(true);
    expect(isSortMode('updated-oldest')).toBe(true);
  });

  it('rejects unknown sort modes', () => {
    expect(isSortMode('modified-newest')).toBe(false);
  });
});
