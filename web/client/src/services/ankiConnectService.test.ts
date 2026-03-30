import { describe, expect, it } from 'vitest';
import {
  AnkiDuplicateConflictError,
  isAnkiDuplicateConflictError,
  isDuplicateAddNoteError,
} from '@/services/ankiConnectService';

describe('ankiConnectService duplicate safeguards', () => {
  it('detects duplicate addNote errors from AnkiConnect message', () => {
    expect(isDuplicateAddNoteError('cannot create note because it is a duplicate')).toBe(true);
    expect(isDuplicateAddNoteError('Duplicate note found')).toBe(true);
    expect(isDuplicateAddNoteError('model was not found: AdFontesWord')).toBe(false);
  });

  it('identifies duplicate conflict error objects with type guard', () => {
    const conflict = {
      noteId: 42,
      deckName: 'test',
      modelName: 'AdFontesWord',
      word: 'abacus',
      existingFields: { Word: 'abacus' },
      incomingFields: {
        Word: 'abacus',
        Context: '',
        notes: '',
        Back: '<p>abacus</p>',
        'Add Reverse': 'true',
        Media: '',
      },
    };

    const error = new AnkiDuplicateConflictError(conflict);
    expect(isAnkiDuplicateConflictError(error)).toBe(true);
    expect(error.conflict.noteId).toBe(42);
    expect(isAnkiDuplicateConflictError(new Error('plain'))).toBe(false);
  });
});
