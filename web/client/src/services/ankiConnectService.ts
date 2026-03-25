import type {
  AnkiConflictAction,
  AnkiDuplicateConflict,
  AnkiConnectInvokePayload,
  AnkiConnectInvokeResult,
  AnkiExportPayload,
} from '@/types/anki';
import request from '@/utils/request';

const ANKI_CONNECT_VERSION = 6;

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

const escapeAnkiQueryValue = (value: string): string => value.replace(/(["\\])/g, '\\$1');

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

  const [noteInfo] = await invoke<
    Array<{
      noteId: number;
      fields: Record<string, { value: string }>;
    }>
  >({
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
  await pingAnkiConnect();
  await ensureModelExists(payload.options.modelName);
  await ensureDeckExists(payload.options.deckName);

  const noteId = await invoke<number>({
    action: 'addNote',
    version: ANKI_CONNECT_VERSION,
    params: {
      note: {
        deckName: payload.options.deckName,
        modelName: payload.options.modelName,
        fields: payload.fields,
        options: {
          allowDuplicate: true,
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
};

export const checkDuplicateConflict = async (
  payload: AnkiExportPayload
): Promise<AnkiDuplicateConflict | null> => {
  await pingAnkiConnect();
  await ensureModelExists(payload.options.modelName);
  await ensureDeckExists(payload.options.deckName);
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

  return { noteId: conflict.noteId };
};

export const downloadDeckAsApkg = async (
  deckName: string,
  fileName: string
): Promise<Blob> => {
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
