import { describe, expect, it } from 'vitest';
import {
  addVisibleSelections,
  getSelectedLemmas,
  isWordSelected,
  makeWordSelectionKey,
  removeVisibleSelections,
} from './wordSelection';

describe('makeWordSelectionKey', () => {
  it('creates distinct keys for local and db records with same id', () => {
    expect(makeWordSelectionKey({ id: '42', isLocal: true })).toBe('local:42');
    expect(makeWordSelectionKey({ id: '42', isLocal: false })).toBe('db:42');
  });
});

describe('getSelectedLemmas', () => {
  it('returns lemmas from persisted selected items and ignores empty values', () => {
    const records = [{ lemma: 'alpha' }, { yield: { lemma: 'beta' } }, { lemma: '' }];

    expect(getSelectedLemmas(records)).toEqual(['alpha', 'beta']);
  });
});

describe('cross-page selection helpers', () => {
  it('adds visible selections without clearing items from other pages', () => {
    const existing = new Set(['db:10']);
    const next = addVisibleSelections(existing, [
      { id: '11', isLocal: false },
      { id: '12', isLocal: false },
    ]);

    expect([...next]).toEqual(['db:10', 'db:11', 'db:12']);
  });

  it('removes only current page selections and keeps hidden selections', () => {
    const existing = new Set(['db:10', 'db:11', 'local:1']);
    const next = removeVisibleSelections(existing, [
      { id: '11', isLocal: false },
      { id: '1', isLocal: true },
    ]);

    expect([...next]).toEqual(['db:10']);
  });

  it('checks selection by composite key so local/db ids do not collide', () => {
    const selectedKeys = new Set(['db:7']);

    expect(isWordSelected(selectedKeys, { id: '7', isLocal: false })).toBe(true);
    expect(isWordSelected(selectedKeys, { id: '7', isLocal: true })).toBe(false);
  });
});
