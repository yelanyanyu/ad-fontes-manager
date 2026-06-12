import { describe, expect, it } from 'vitest';

import { createWordEditorSession } from './session';

describe('createWordEditorSession', () => {
  it('starts new words as current-schema create sessions even when YAML hides app metadata', () => {
    const session = createWordEditorSession();

    session.loadNewWord('yield:\n  lemma: current\n');

    expect(session.mode.value).toBe('create');
    expect(session.baseWordId.value).toBeNull();
    expect(session.displayFreshness.value).toBeNull();
    expect(session.validationContext.value).toEqual({
      intent: 'create',
      wordId: undefined,
      baseWordSchemaVersion: undefined,
    });
  });

  it('uses the loaded word context as the visible freshness source for existing words', () => {
    const session = createWordEditorSession();

    session.loadExistingWord('yield:\n  lemma: legacy\n', {
      id: 'word-1',
      wordSchemaVersion: 1,
      isLatestSchema: false,
    });

    expect(session.mode.value).toBe('update');
    expect(session.baseWordId.value).toBe('word-1');
    expect(session.baseWordSchemaVersion.value).toBe(1);
    expect(session.displayFreshness.value).toBe('old');
    expect(session.validationContext.value).toEqual({
      intent: 'update-existing',
      wordId: 'word-1',
      baseWordSchemaVersion: 1,
    });
  });
});
