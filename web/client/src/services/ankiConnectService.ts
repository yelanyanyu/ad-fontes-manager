import type {
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
