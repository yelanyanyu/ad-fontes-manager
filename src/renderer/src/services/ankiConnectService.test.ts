import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiDuplicateConflict, AnkiExportPayload, FieldMappingConfig } from '@/types/anki';

const { requestPostMock } = vi.hoisted(() => ({
  requestPostMock: vi.fn(),
}));

vi.mock('@/utils/request', () => ({
  default: {
    post: requestPostMock,
  },
}));

import {
  AnkiDuplicateConflictError,
  AnkiDuplicateNotesAmbiguityError,
  AnkiImportStateMismatchError,
  applyDuplicateResolution,
  checkDuplicateConflict,
  getModelStyling,
  importPayloadToAnki,
  isAnkiDuplicateConflictError,
  isAnkiImportStateMismatchError,
  isDuplicateAddNoteError,
} from '@/services/ankiConnectService';

const DEFAULT_FIELD_MAPPING: FieldMappingConfig = [
  { source: 'lemma', target: 'Word' },
  { source: 'user_context_sentence', target: 'Context' },
  { source: 'rendered_html', target: 'Back' },
];

const ALT_FIELD_MAPPING: FieldMappingConfig = [
  { source: 'lemma', target: 'id' },
  { source: 'user_context_sentence', target: 'question' },
  { source: 'rendered_html', target: 'answer' },
];

const payload: AnkiExportPayload = {
  fields: {
    Word: 'craft',
    Context:
      "The potter's hands moved with the quiet craft of generations, shaping the spinning clay into a thin-walled bowl.",
    notes: '',
    Back: '<p>updated back</p>',
    Media: '',
  },
  options: {
    deckName: 'English::English-word',
    modelName: '单词模板-Quizify',
    tags: ['English::type::word'],
  },
  sourceWordId: 'word-1',
  sourceLemma: 'craft',
  fieldMapping: DEFAULT_FIELD_MAPPING,
};

const asAnkiResponse = <T>(result: T, error: string | null = null) => ({ result, error });

const asNoteInfo = (noteId: number, fields: Record<string, string>) => ({
  noteId,
  fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { value }])),
});

const mockPrepareTarget = (): void => {
  requestPostMock
    .mockResolvedValueOnce(asAnkiResponse(6))
    .mockResolvedValueOnce(asAnkiResponse([payload.options.deckName]));
};

describe('ankiConnectService duplicate safeguards', () => {
  beforeEach(() => {
    requestPostMock.mockReset();
  });

  it('detects duplicate addNote errors from AnkiConnect message', () => {
    expect(isDuplicateAddNoteError('cannot create note because it is a duplicate')).toBe(true);
    expect(isDuplicateAddNoteError('Duplicate note found')).toBe(true);
    expect(isDuplicateAddNoteError('model was not found: AdFontesWord')).toBe(false);
  });

  it('loads model styling from AnkiConnect', async () => {
    requestPostMock.mockResolvedValueOnce(asAnkiResponse({ css: '.card { color: #222; }' }));

    await expect(getModelStyling(payload.options.modelName)).resolves.toBe(
      '.card { color: #222; }'
    );
    expect(requestPostMock).toHaveBeenCalledWith(
      '/anki/connect',
      {
        action: 'modelStyling',
        version: 6,
        params: { modelName: payload.options.modelName },
      },
      expect.objectContaining({ skipErrorToast: true })
    );
  });

  it('preserves empty model styling so callers can decide whether to warn', async () => {
    requestPostMock.mockResolvedValueOnce(asAnkiResponse({ css: '' }));

    await expect(getModelStyling(payload.options.modelName)).resolves.toBe('');
  });

  it('surfaces AnkiConnect model styling errors', async () => {
    requestPostMock.mockResolvedValueOnce(asAnkiResponse(null, 'model was not found'));

    await expect(getModelStyling(payload.options.modelName)).rejects.toThrow('model was not found');
  });

  it('identifies duplicate conflict error objects with type guard', () => {
    const conflict: AnkiDuplicateConflict = {
      noteId: 42,
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      word: 'craft',
      existingFields: { Word: 'craft' },
      incomingFields: payload.fields,
    };

    const error = new AnkiDuplicateConflictError(conflict);
    expect(isAnkiDuplicateConflictError(error)).toBe(true);
    expect(error.conflict.noteId).toBe(42);
    expect(isAnkiDuplicateConflictError(new Error('plain'))).toBe(false);
  });

  it('identifies import state mismatch errors with type guard', () => {
    const error = new AnkiImportStateMismatchError({
      word: 'craft',
      expectedState: 'ready',
      actualState: 'duplicate',
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      noteId: 42,
    });

    expect(isAnkiImportStateMismatchError(error)).toBe(true);
    expect(error.expectedState).toBe('ready');
    expect(error.actualState).toBe('duplicate');
    expect(isAnkiImportStateMismatchError(new Error('plain'))).toBe(false);
  });

  it('uses a precise target word field query and returns null when no note matches', async () => {
    mockPrepareTarget();
    requestPostMock.mockResolvedValueOnce(asAnkiResponse([]));

    const conflict = await checkDuplicateConflict(payload);

    expect(conflict).toBeNull();
    expect(requestPostMock).toHaveBeenNthCalledWith(
      3,
      '/anki/connect',
      expect.objectContaining({
        action: 'findNotes',
        params: {
          query: 'deck:"English::English-word" note:"单词模板-Quizify" Word:"craft"',
        },
      }),
      expect.objectContaining({ skipErrorToast: true })
    );
  });

  it('returns the matching note details when the precise word query finds a single note', async () => {
    mockPrepareTarget();
    requestPostMock.mockResolvedValueOnce(asAnkiResponse([1751855393543])).mockResolvedValueOnce(
      asAnkiResponse([
        asNoteInfo(1751855393543, {
          Word: 'craft',
          Context: 'existing context',
          notes: 'existing notes',
          Back: '<p>existing back</p>',
          Media: 'craft.mp3',
        }),
      ])
    );

    const conflict = await checkDuplicateConflict(payload);

    expect(conflict).toEqual({
      noteId: 1751855393543,
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      word: 'craft',
      existingFields: {
        Word: 'craft',
        Context: 'existing context',
        notes: 'existing notes',
        Back: '<p>existing back</p>',
        Media: 'craft.mp3',
      },
      incomingFields: payload.fields,
    });
  });

  it('throws an ambiguity error when multiple notes match the target word query', async () => {
    mockPrepareTarget();
    requestPostMock.mockResolvedValueOnce(asAnkiResponse([1, 2]));

    await expect(checkDuplicateConflict(payload)).rejects.toBeInstanceOf(
      AnkiDuplicateNotesAmbiguityError
    );
    expect(requestPostMock).toHaveBeenCalledTimes(3);
  });

  it('uses the mapped word field name when a model mapping overrides the default word field', async () => {
    requestPostMock
      .mockResolvedValueOnce(asAnkiResponse(6))
      .mockResolvedValueOnce(asAnkiResponse([payload.options.deckName]));
    requestPostMock.mockResolvedValueOnce(asAnkiResponse([]));

    await checkDuplicateConflict({
      ...payload,
      options: {
        ...payload.options,
        modelName: 'QuestionAnswerMapped',
      },
      fields: {
        id: 'craft',
        question: payload.fields.Context,
        notes: payload.fields.notes,
        answer: payload.fields.Back,
        audio: payload.fields.Media,
      },
      fieldMapping: ALT_FIELD_MAPPING,
    });

    expect(requestPostMock).toHaveBeenNthCalledWith(
      3,
      '/anki/connect',
      expect.objectContaining({
        action: 'findNotes',
        params: {
          query: 'deck:"English::English-word" note:"QuestionAnswerMapped" id:"craft"',
        },
      }),
      expect.objectContaining({ skipErrorToast: true })
    );
  });

  it('omits blank fields from updateNoteFields requests so existing values are preserved', async () => {
    const conflict: AnkiDuplicateConflict = {
      noteId: 1751855393543,
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      word: 'craft',
      existingFields: {
        Word: 'craft',
        Context: 'existing context',
        notes: 'keep these notes',
        Back: '<p>old back</p>',
        Media: 'craft.mp3',
      },
      incomingFields: {
        Word: 'craft',
        Context: '',
        notes: '   ',
        Back: '<p>updated back</p>',
        Media: '',
      },
    };

    requestPostMock.mockResolvedValueOnce(asAnkiResponse(null)).mockResolvedValueOnce(
      asAnkiResponse([
        asNoteInfo(conflict.noteId, {
          Word: 'craft',
          Context: 'existing context',
          notes: 'keep these notes',
          Back: '<p>updated back</p>',
          Media: 'craft.mp3',
        }),
      ])
    );

    await expect(
      applyDuplicateResolution(
        {
          ...payload,
          fields: conflict.incomingFields,
        },
        conflict,
        'overwrite'
      )
    ).resolves.toEqual({ noteId: conflict.noteId });

    expect(requestPostMock).toHaveBeenNthCalledWith(
      1,
      '/anki/connect',
      expect.objectContaining({
        action: 'updateNoteFields',
        params: {
          note: {
            id: conflict.noteId,
            fields: {
              Word: 'craft',
              Back: '<p>updated back</p>',
            },
          },
        },
      }),
      expect.objectContaining({ skipErrorToast: true })
    );
  });

  it('reuses the precise word-field duplicate lookup when addNote reports a duplicate', async () => {
    mockPrepareTarget();
    requestPostMock
      .mockResolvedValueOnce(
        asAnkiResponse<number | null>(null, 'cannot create note because it is a duplicate')
      )
      .mockResolvedValueOnce(asAnkiResponse([1751855393543]))
      .mockResolvedValueOnce(
        asAnkiResponse([
          asNoteInfo(1751855393543, {
            Word: 'craft',
            Context: 'existing context',
            notes: '',
            Back: '<p>existing back</p>',
            Media: '',
          }),
        ])
      );

    await expect(importPayloadToAnki(payload)).rejects.toBeInstanceOf(AnkiDuplicateConflictError);
    expect(requestPostMock).toHaveBeenNthCalledWith(
      4,
      '/anki/connect',
      expect.objectContaining({
        action: 'findNotes',
        params: {
          query: 'deck:"English::English-word" note:"单词模板-Quizify" Word:"craft"',
        },
      }),
      expect.objectContaining({ skipErrorToast: true })
    );
  });
});
