import type {
  AnkiConflictAction,
  AnkiDuplicateConflict,
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
  const query = [
    `deck:"${escapeAnkiQueryValue(payload.options.deckName)}"`,
    `note:"${escapeAnkiQueryValue(payload.options.modelName)}"`,
    `Word:"${escapeAnkiQueryValue(payload.fields.Word)}"`,
  ].join(' ');

  const noteIds = await invoke<number[]>({
    action: 'findNotes',
    version: ANKI_CONNECT_VERSION,
    params: { query },
  });

  if (!noteIds.length) return null;

  const [noteInfo] = await invoke<Array<NoteInfoResponse>>({
    action: 'notesInfo',
    version: ANKI_CONNECT_VERSION,
    params: { notes: [noteIds[0]] },
  });

  if (!noteInfo) return null;

  return {
    noteId: noteInfo.noteId,
    deckName: payload.options.deckName,
    modelName: payload.options.modelName,
    word: payload.fields.Word,
    existingFields: {
      Word: noteInfo.fields.Word?.value || '',
      Context: noteInfo.fields.Context?.value || '',
      notes: noteInfo.fields.notes?.value || '',
      Back: noteInfo.fields.Back?.value || '',
      'Add Reverse': noteInfo.fields['Add Reverse']?.value || '',
      Media: noteInfo.fields.Media?.value || '',
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
  strategy: AnkiImportStrategy
): Promise<{ noteId: number; mode: 'added' | 'overwritten' }> => {
  await prepareAnkiTarget(payload);

  const conflict = await getExistingNoteByWord(payload);
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

export const downloadDeckAsApkg = async (deckName: string, fileName: string): Promise<Blob> => {
  await pingAnkiConnect();
  await ensureDeckExists(deckName);
  return request.post<Blob>(
    '/anki/export-apkg',
    {
      deckName,
      includeSched: false,
      fileName,
    },
    {
      responseType: 'blob',
      skipErrorToast: true,
    }
  );
};
