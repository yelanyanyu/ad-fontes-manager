import type {
  AnkiApkgExportRequest,
  AnkiConflictAction,
  AnkiDuplicateConflict,
  AnkiDuplicateState,
  AnkiConnectInvokePayload,
  AnkiConnectInvokeResult,
  AnkiExportPayload,
  AnkiImportStrategy,
  AnkiModelTemplate,
} from '@/types/anki';
import request from '@/utils/request';

const ANKI_CONNECT_VERSION = 6;

type NoteInfoResponse = {
  noteId: number;
  fields: Record<string, { value: string }>;
  cards?: number[];
};

type CardInfoResponse = {
  deckName?: string;
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

const getPayloadWordFieldName = (payload: AnkiExportPayload): string =>
  payload.fieldMapping?.find(entry => entry.source === 'lemma')?.target || '';

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

const getFirstCardDeckName = async (noteInfo: NoteInfoResponse): Promise<string | null> => {
  if (!noteInfo.cards?.length) return null;

  const [cardInfo] = await invoke<Array<CardInfoResponse>>({
    action: 'cardsInfo',
    version: ANKI_CONNECT_VERSION,
    params: { cards: [noteInfo.cards[0]] },
  });

  return cardInfo?.deckName?.trim() || null;
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

export const ensureDeckExists = async (deckName: string): Promise<void> => {
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
  await ensureDeckExists(payload.options.deckName);
};

const escapeAnkiQueryValue = (value: string): string => value.replace(/(["\\])/g, '\\$1');

export const isDuplicateAddNoteError = (message: string): boolean =>
  DUPLICATE_NOTE_ERROR_PATTERN.test(String(message || ''));

const getSingleMatchingNoteInfo = async (
  noteIds: number[],
  wordFieldName: string,
  incomingWord: string
): Promise<NoteInfoResponse | null> => {
  if (!noteIds.length) return null;

  const noteInfos = await invoke<Array<NoteInfoResponse>>({
    action: 'notesInfo',
    version: ANKI_CONNECT_VERSION,
    params: { notes: noteIds },
  });
  const matchingNotes = noteInfos.filter(
    noteInfo => normalizeFieldValue(noteInfo.fields[wordFieldName]?.value) === incomingWord
  );

  if (!matchingNotes.length) return null;
  if (matchingNotes.length > 1) {
    throw new AnkiDuplicateNotesAmbiguityError(
      incomingWord,
      matchingNotes.map(note => note.noteId)
    );
  }

  return matchingNotes[0];
};

const getExistingNoteByWord = async (
  payload: AnkiExportPayload
): Promise<AnkiDuplicateConflict | null> => {
  const wordFieldName = getPayloadWordFieldName(payload);
  const incomingWord = getPayloadWordValue(payload);
  if (!incomingWord) {
    return null;
  }

  const escapedWord = escapeAnkiQueryValue(incomingWord);
  const escapedModel = escapeAnkiQueryValue(payload.options.modelName);

  const query = [`note:"${escapedModel}"`, `${wordFieldName}:"${escapedWord}"`].join(' ');

  const noteIds = await invoke<number[]>({
    action: 'findNotes',
    version: ANKI_CONNECT_VERSION,
    params: { query },
  });

  if (noteIds.length > 1) {
    throw new AnkiDuplicateNotesAmbiguityError(incomingWord, noteIds);
  }

  let matchingNoteInfo = await getSingleMatchingNoteInfo(noteIds, wordFieldName, incomingWord);

  if (!matchingNoteInfo) {
    const broadQuery = [`note:"${escapedModel}"`, `"${escapedWord}"`].join(' ');
    const broadNoteIds = await invoke<number[]>({
      action: 'findNotes',
      version: ANKI_CONNECT_VERSION,
      params: { query: broadQuery },
    });
    matchingNoteInfo = await getSingleMatchingNoteInfo(broadNoteIds, wordFieldName, incomingWord);
  }

  if (!matchingNoteInfo) return null;

  const existingDeckName = await getFirstCardDeckName(matchingNoteInfo);

  return {
    noteId: matchingNoteInfo.noteId,
    deckName: existingDeckName || payload.options.deckName,
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

export const getModelFieldNames = async (modelName: string): Promise<string[]> =>
  invoke<string[]>({
    action: 'modelFieldNames',
    version: ANKI_CONNECT_VERSION,
    params: { modelName },
  });

export const getModelStyling = async (modelName: string): Promise<string> => {
  const result = await invoke<{ css: string }>({
    action: 'modelStyling',
    version: ANKI_CONNECT_VERSION,
    params: { modelName },
  });
  return result.css;
};

export const getModelTemplates = async (modelName: string): Promise<AnkiModelTemplate[]> => {
  const templates = await invoke<Record<string, { Front?: string; Back?: string }>>({
    action: 'modelTemplates',
    version: ANKI_CONNECT_VERSION,
    params: { modelName },
  });

  return Object.entries(templates).map(([name, template]) => ({
    name,
    front: template?.Front || '',
    back: template?.Back || '',
  }));
};

export const importPayloadToAnki = async (
  payload: AnkiExportPayload,
  options?: { skipPrepare?: boolean }
): Promise<{ noteId: number }> => {
  if (!options?.skipPrepare) await prepareAnkiTarget(payload);

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
  expectedDuplicateState?: AnkiDuplicateState,
  options?: { skipPrepare?: boolean }
): Promise<{ noteId: number; mode: 'added' | 'overwritten' }> => {
  if (!options?.skipPrepare) await prepareAnkiTarget(payload);

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
    const added = await importPayloadToAnki(payload, { skipPrepare: true });
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
  payload: AnkiExportPayload,
  options?: { skipPrepare?: boolean }
): Promise<AnkiDuplicateConflict | null> => {
  if (!options?.skipPrepare) await prepareAnkiTarget(payload);
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
  requestPayload: AnkiApkgExportRequest
): Promise<Blob> => {
  if (!requestPayload.payloads.length) {
    throw new Error('At least one payload is required for .apkg export');
  }

  return request.post<Blob>('/anki/export-apkg', requestPayload, {
    responseType: 'blob',
    skipErrorToast: true,
  });
};
