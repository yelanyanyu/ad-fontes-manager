import { describe, expect, it } from 'vitest';
import { getSelectedLemmas, makeWordSelectionKey } from './wordSelection';

describe('makeWordSelectionKey', () => {
  it('creates distinct keys for local and db records with same id', () => {
    expect(makeWordSelectionKey({ id: '42', isLocal: true })).toBe('local:42');
    expect(makeWordSelectionKey({ id: '42', isLocal: false })).toBe('db:42');
  });
});

describe('getSelectedLemmas', () => {
  it('returns only selected lemmas and ignores empty values', () => {
    const records = [
      { id: '1', isLocal: true, lemma: 'alpha' },
      { id: '1', isLocal: false, yield: { lemma: 'beta' } },
      { id: '2', isLocal: false, lemma: '' },
    ];

    const selectedKeys = new Set(['local:1', 'db:1', 'db:2']);
    expect(getSelectedLemmas(records, selectedKeys)).toEqual(['alpha', 'beta']);
  });
});
