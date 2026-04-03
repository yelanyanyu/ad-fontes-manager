import type {
  AnkiConflictAction,
  AnkiDuplicateConflict,
  AnkiDuplicateState,
  AnkiFieldMapping,
  AnkiConnectInvokePayload,
  AnkiConnectInvokeResult,
  AnkiExportPayload,
  AnkiImportStrategy,
} from '@/types/anki';
import { DEFAULT_ANKI_FIELD_MAPPING } from '@/services/ankiFieldMapper';
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

export class AnkiDuplicateNotesAmbiguityError extends Error {
  word: string;
  noteIds: number[];

  constructor(word: string, noteIds: number[]) {
    super(
      `Detected multiple Anki notes for "${word}" (${noteIds.join(
        ', '
      )}). Please clean up duplicate notes in Anki before updating.`
    );
    this.name = 'AnkiDuplicateNotesAmbiguityError';
    this.word = word;
    this.noteIds = noteIds;
  }
}

const normalizeFieldValue = (value: string | undefined): string =>
  (value ?? '').replace(/\r\n/g, '\n').trim();

const resolveFieldMapping = (payload: AnkiExportPayload): AnkiFieldMapping =>
  payload.fieldMapping || DEFAULT_ANKI_FIELD_MAPPING;

const getPayloadWordFieldName = (payload: AnkiExportPayload): string =>
  resolveFieldMapping(payload).word;

const getPayloadWordValue = (payload: AnkiExportPayload): string =>
  normalizeFieldValue(payload.fields[getPayloadWordFieldName(payload)]);

const getNonEmptyFields = (fields: Record<string, string>): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => normalizeFieldValue(value) !== '')
  );
};

const flattenNoteFields = (noteInfo: NoteInfoResponse): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(noteInfo.fields).map(([fieldName, fieldValue]) => [
      fieldName,
      fieldValue.value || '',
    ])
  );
};

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
  const wordFieldName = getPayloadWordFieldName(payload);
  const incomingWord = getPayloadWordValue(payload);
  if (!incomingWord) {
    return null;
  }

  const escapedWord = escapeAnkiQueryValue(incomingWord);
  const escapedDeck = escapeAnkiQueryValue(payload.options.deckName);
  const escapedModel = escapeAnkiQueryValue(payload.options.modelName);

  const query = [
    `deck:"${escapedDeck}"`,
    `note:"${escapedModel}"`,
    `${wordFieldName}:"${escapedWord}"`,
  ].join(' ');

  const noteIds = await invoke<number[]>({
    action: 'findNotes',
    version: ANKI_CONNECT_VERSION,
    params: { query },
  });

  if (!noteIds.length) {
    return null;
  }

  if (noteIds.length > 1) {
    throw new AnkiDuplicateNotesAmbiguityError(incomingWord, noteIds);
  }

  const [matchingNoteInfo] = await invoke<Array<NoteInfoResponse>>({
    action: 'notesInfo',
    version: ANKI_CONNECT_VERSION,
    params: { notes: noteIds },
  });

  if (!matchingNoteInfo) return null;

  return {
    noteId: matchingNoteInfo.noteId,
    deckName: payload.options.deckName,
    modelName: payload.options.modelName,
    word: incomingWord,
    existingFields: flattenNoteFields(matchingNoteInfo),
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
      word: getPayloadWordValue(payload),
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

  const fieldsToUpdate = getNonEmptyFields(payload.fields);

  await invoke({
    action: 'updateNoteFields',
    version: ANKI_CONNECT_VERSION,
    params: {
      note: {
        id: conflict.noteId,
        fields: fieldsToUpdate,
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

  const changedFieldDiagnostics = Object.entries(fieldsToUpdate).flatMap(
    ([fieldName, incomingValue]) => {
      const previousValue = normalizeFieldValue(conflict.existingFields[fieldName]);
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
