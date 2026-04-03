import type {
  AnkiConflictAction,
  AnkiDuplicateConflict,
  AnkiDuplicateState,
  AnkiConnectInvokePayload,
  AnkiConnectInvokeResult,
  AnkiExportPayload,
  AnkiImportStrategy,
} from '@/types/anki';
import request from '@/utils/request';

const ANKI_CONNECT_VERSION = 6;

type NoteInfoResponse = {
  noteId: number;
  fields: Record<string, { value: string }>;
};

const DUPLICATE_NOTE_ERROR_PATTERN = /duplicate/i;

export class AnkiDuplicateConflictError extends Error {
  conflict: AnkiDuplicateConflict;

  constructor(conflict: AnkiDuplicateConflict) {
    super(`Duplicate Anki note detected for "${conflict.word}" (noteId=${conflict.noteId})`);
    this.name = 'AnkiDuplicateConflictError';
    this.conflict = conflict;
  }
}

export const isAnkiDuplicateConflictError = (error: unknown): error is AnkiDuplicateConflictError =>
  error instanceof AnkiDuplicateConflictError;

export class AnkiImportStateMismatchError extends Error {
  word: string;
  expectedState: AnkiDuplicateState;
  actualState: AnkiDuplicateState;
  deckName: string;
  modelName: string;
  noteId: number | null;

  constructor(params: {
    word: string;
    expectedState: AnkiDuplicateState;
    actualState: AnkiDuplicateState;
    deckName: string;
    modelName: string;
    noteId: number | null;
  }) {
    const { word, expectedState, actualState, deckName, modelName, noteId } = params;
    super(
      `Import state mismatch for "${word}": expected "${expectedState}" but detected "${actualState}" before import (deck="${deckName}", model="${modelName}", noteId=${noteId ?? 'n/a'})`
    );
    this.name = 'AnkiImportStateMismatchError';
    this.word = word;
    this.expectedState = expectedState;
    this.actualState = actualState;
    this.deckName = deckName;
    this.modelName = modelName;
    this.noteId = noteId;
  }
}

export const isAnkiImportStateMismatchError = (
  error: unknown
): error is AnkiImportStateMismatchError => error instanceof AnkiImportStateMismatchError;

const normalizeFieldValue = (value: string | undefined): string =>
  (value ?? '').replace(/\r\n/g, '\n').trim();

const invoke = async <T>(payload: AnkiConnectInvokePayload): Promise<T> => {
  const data = await request.post<AnkiConnectInvokeResult<T>>('/anki/connect', payload, {
    skipErrorToast: true,
  });
  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
};

const ensureModelExists = async (modelName: string): Promise<void> => {
  const models = await invoke<string[]>({
    action: 'modelNames',
    version: ANKI_CONNECT_VERSION,
  });

  if (models.includes(modelName)) return;

  await invoke({
    action: 'createModel',
    version: ANKI_CONNECT_VERSION,
    params: {
      modelName,
      inOrderFields: ['Word', 'Context', 'notes', 'Back', 'Add Reverse', 'Media'],
      css: '.card { font-family: Arial; font-size: 18px; text-align: left; color: black; }',
      cardTemplates: [
        {
          Name: 'Forward',
          Front: '{{Word}}<hr>{{Context}}',
          Back: '{{FrontSide}}<hr>{{Back}}<hr>{{notes}}',
        },
        {
          Name: 'Reverse',
          Front: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
          Back: '{{#Add Reverse}}{{Word}}<hr>{{Context}}<hr>{{notes}}{{/Add Reverse}}',
        },
      ],
    },
  });
};

const ensureDeckExists = async (deckName: string): Promise<void> => {
  const decks = await invoke<string[]>({
    action: 'deckNames',
    version: ANKI_CONNECT_VERSION,
  });
  if (decks.includes(deckName)) return;

  await invoke({
    action: 'createDeck',
    version: ANKI_CONNECT_VERSION,
    params: { deck: deckName },
  });
};

const prepareAnkiTarget = async (payload: AnkiExportPayload): Promise<void> => {
  await pingAnkiConnect();
  await ensureModelExists(payload.options.modelName);
  await ensureDeckExists(payload.options.deckName);
};

const escapeAnkiQueryValue = (value: string): string => value.replace(/(["\\])/g, '\\$1');

export const isDuplicateAddNoteError = (message: string): boolean =>
  DUPLICATE_NOTE_ERROR_PATTERN.test(String(message || ''));

const getExistingNoteByWord = async (
  payload: AnkiExportPayload
): Promise<AnkiDuplicateConflict | null> => {
  const escapedWord = escapeAnkiQueryValue(payload.fields.Word.trim());
  const escapedDeck = escapeAnkiQueryValue(payload.options.deckName);
  const escapedModel = escapeAnkiQueryValue(payload.options.modelName);
  const incomingWord = normalizeFieldValue(payload.fields.Word);

  const queries = [
    [`deck:"${escapedDeck}"`, `note:"${escapedModel}"`, `Word:"${escapedWord}"`].join(' '),
    [`deck:"${escapedDeck}"`, `note:"${escapedModel}"`, `"${escapedWord}"`].join(' '),
    [`deck:"${escapedDeck}"`, `"${escapedWord}"`].join(' '),
    `"${escapedWord}"`,
  ];

  let matchingNoteInfo: NoteInfoResponse | null = null;
  for (const query of queries) {
    const noteIds = await invoke<number[]>({
      action: 'findNotes',
      version: ANKI_CONNECT_VERSION,
      params: { query },
    });

    if (!noteIds.length) continue;

    const noteInfos = await invoke<Array<NoteInfoResponse>>({
      action: 'notesInfo',
      version: ANKI_CONNECT_VERSION,
      params: { notes: noteIds },
    });

    const exactWordFieldMatch = noteInfos.find(noteInfo => {
      const wordField = noteInfo.fields.Word?.value;
      return normalizeFieldValue(wordField) === incomingWord;
    });
    if (exactWordFieldMatch) {
      matchingNoteInfo = exactWordFieldMatch;
      break;
    }

    const exactFirstFieldMatch = noteInfos.find(noteInfo => {
      const firstField = Object.values(noteInfo.fields)[0]?.value;
      return normalizeFieldValue(firstField) === incomingWord;
    });
    if (exactFirstFieldMatch) {
      matchingNoteInfo = exactFirstFieldMatch;
      break;
    }

    const fallback = noteInfos[0];
    if (fallback) {
      matchingNoteInfo = fallback;
      break;
    }
  }

  if (!matchingNoteInfo) return null;

  return {
    noteId: matchingNoteInfo.noteId,
    deckName: payload.options.deckName,
    modelName: payload.options.modelName,
    word: payload.fields.Word,
    existingFields: {
      Word: matchingNoteInfo.fields.Word?.value || '',
      Context: matchingNoteInfo.fields.Context?.value || '',
      notes: matchingNoteInfo.fields.notes?.value || '',
      Back: matchingNoteInfo.fields.Back?.value || '',
      'Add Reverse': matchingNoteInfo.fields['Add Reverse']?.value || '',
      Media: matchingNoteInfo.fields.Media?.value || '',
    },
    incomingFields: payload.fields,
  };
};

export const pingAnkiConnect = async (): Promise<number> =>
  invoke<number>({ action: 'version', version: ANKI_CONNECT_VERSION });

export const getDeckNames = async (): Promise<string[]> =>
  invoke<string[]>({
    action: 'deckNames',
    version: ANKI_CONNECT_VERSION,
  });

export const getModelNames = async (): Promise<string[]> =>
  invoke<string[]>({
    action: 'modelNames',
    version: ANKI_CONNECT_VERSION,
  });

export const importPayloadToAnki = async (
  payload: AnkiExportPayload
): Promise<{ noteId: number }> => {
  await prepareAnkiTarget(payload);

  try {
    const noteId = await invoke<number>({
      action: 'addNote',
      version: ANKI_CONNECT_VERSION,
      params: {
        note: {
          deckName: payload.options.deckName,
          modelName: payload.options.modelName,
          fields: payload.fields,
          options: {
            allowDuplicate: false,
            duplicateScope: 'deck',
            duplicateScopeOptions: {
              deckName: payload.options.deckName,
              checkChildren: false,
              checkAllModels: false,
            },
          },
          tags: payload.options.tags,
        },
      },
    });

    return { noteId };
  } catch (error) {
    const message = (error as { message?: string })?.message || '';
    if (!isDuplicateAddNoteError(message)) {
      throw error;
    }

    const conflict = await getExistingNoteByWord(payload);
    if (!conflict) {
      throw error;
    }

    throw new AnkiDuplicateConflictError(conflict);
  }
};

export const importPayloadWithStrategy = async (
  payload: AnkiExportPayload,
  strategy: AnkiImportStrategy,
  expectedDuplicateState?: AnkiDuplicateState
): Promise<{ noteId: number; mode: 'added' | 'overwritten' }> => {
  await prepareAnkiTarget(payload);

  const conflict = await getExistingNoteByWord(payload);
  const actualDuplicateState: AnkiDuplicateState = conflict ? 'duplicate' : 'ready';
  if (expectedDuplicateState && expectedDuplicateState !== actualDuplicateState) {
    throw new AnkiImportStateMismatchError({
      word: payload.fields.Word,
      expectedState: expectedDuplicateState,
      actualState: actualDuplicateState,
      deckName: payload.options.deckName,
      modelName: payload.options.modelName,
      noteId: conflict?.noteId ?? null,
    });
  }

  if (!conflict) {
    const added = await importPayloadToAnki(payload);
    return { noteId: added.noteId, mode: 'added' };
  }

  if (strategy === 'add_if_not_duplicate') {
    throw new AnkiDuplicateConflictError(conflict);
  }

  const overwriteResult = await applyDuplicateResolution(payload, conflict, 'overwrite');
  if ('skipped' in overwriteResult) {
    throw new Error('Unexpected skip result while using overwrite_if_duplicate strategy');
  }

  return { noteId: overwriteResult.noteId, mode: 'overwritten' };
};

export const checkDuplicateConflict = async (
  payload: AnkiExportPayload
): Promise<AnkiDuplicateConflict | null> => {
  await prepareAnkiTarget(payload);
  return getExistingNoteByWord(payload);
};

export const applyDuplicateResolution = async (
  payload: AnkiExportPayload,
  conflict: AnkiDuplicateConflict,
  action: AnkiConflictAction
): Promise<{ noteId: number } | { skipped: true }> => {
  if (action === 'skip') {
    return { skipped: true };
  }

  await invoke({
    action: 'updateNoteFields',
    version: ANKI_CONNECT_VERSION,
    params: {
      note: {
        id: conflict.noteId,
        fields: payload.fields,
      },
    },
  });

  const [noteInfoAfterUpdate] = await invoke<Array<NoteInfoResponse>>({
    action: 'notesInfo',
    version: ANKI_CONNECT_VERSION,
    params: { notes: [conflict.noteId] },
  });

  if (!noteInfoAfterUpdate) {
    throw new Error(`Anki overwrite verification failed: note ${conflict.noteId} not found`);
  }

  const changedFieldDiagnostics = Object.entries(payload.fields).flatMap(
    ([fieldName, incomingValue]) => {
      const previousValue = normalizeFieldValue(
        conflict.existingFields[fieldName as keyof typeof conflict.existingFields]
      );
      const expectedValue = normalizeFieldValue(incomingValue);
      const actualValue = normalizeFieldValue(noteInfoAfterUpdate.fields[fieldName]?.value);

      // Only verify fields that are intended to change; unchanged fields are ignored.
      if (previousValue === expectedValue) {
        return [];
      }

      if (actualValue === expectedValue) {
        return [];
      }

      return [
        `${fieldName} mismatch (expected len=${expectedValue.length}, actual len=${actualValue.length}, previous len=${previousValue.length})`,
      ];
    }
  );

  if (changedFieldDiagnostics.length > 0) {
    throw new Error(
      `Anki overwrite verification failed for note ${conflict.noteId}: ${changedFieldDiagnostics.join(
        '; '
      )}`
    );
  }

  return { noteId: conflict.noteId };
};

export const downloadPayloadsAsApkg = async (
  payloads: AnkiExportPayload[],
  fileName: string
): Promise<Blob> => {
  if (!payloads.length) {
    throw new Error('At least one payload is required for .apkg export');
  }

  return request.post<Blob>(
    '/anki/export-apkg',
    {
      fileName,
      payloads,
    },
    {
      responseType: 'blob',
      skipErrorToast: true,
    }
  );
};
