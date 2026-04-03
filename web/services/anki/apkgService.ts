import { createHash } from 'node:crypto';

type AnkiTargetFields = {
  Word: string;
  Context: string;
  notes: string;
  Back: string;
  'Add Reverse': string;
  Media: string;
};

type AnkiExportPayload = {
  fields: AnkiTargetFields;
  options: {
    deckName: string;
    modelName: string;
    addReverse: boolean;
    tags: string[];
  };
  sourceWordId?: string;
  sourceLemma?: string;
};

type TemplateConfig = {
  questionFormat?: string;
  answerFormat?: string;
  css?: string;
};

type AnkiExportInstance = {
  topDeckId: number;
  topModelId: number;
  db: {
    prepare: (query: string) => { getAsObject: (params?: Record<string, unknown>) => unknown };
    exec: (query: string) => Array<{ values: unknown[][] }>;
  };
  _getInitialRowValue: (table: string, column: string) => Record<string, Record<string, unknown>>;
  _update: (query: string, params: Record<string, unknown>) => void;
  _getNoteGuid: (topDeckId: number, front: string, back: string) => string;
  addCard: (front: string, back: string, options?: { tags?: string[] | string }) => void;
  save: () => Promise<Buffer>;
};

const { default: createAnkiExport } = require('anki-apkg-export') as {
  default: (deckName: string, template?: TemplateConfig) => AnkiExportInstance;
};

const DEFAULT_FILE_NAME = 'ad-fontes-export.apkg';
const FIELD_SEPARATOR = '<hr>';
const DEFAULT_CARD_CSS =
  '.card { font-family: Arial; font-size: 18px; text-align: left; color: black; }';

const REVERSE_FIELD_TOKEN = /(?:true|yes|1)/i;

const toPositive32Int = (key: string): number => {
  const digest = createHash('sha1').update(key).digest();
  return digest.readUInt32BE(0) & 0x7fffffff;
};

const toStableIdentifier = (key: string): number => {
  // Keep ids in a high range to avoid clashing with template defaults.
  return 1_000_000_000 + (toPositive32Int(key) % 1_000_000_000);
};

const normalizeField = (value: string | undefined): string => String(value || '').trim();

const buildGuidKey = (payload: AnkiExportPayload, deckName: string): string => {
  const sourceWordId = normalizeField(payload.sourceWordId);
  if (sourceWordId) return sourceWordId;

  const sourceLemma = normalizeField(payload.sourceLemma) || normalizeField(payload.fields.Word);
  return `${sourceLemma || 'unknown'}::${deckName}`;
};

const addGuidMarker = (content: string, guidKey: string, suffix: 'f' | 'r'): string => {
  return `<!--adf-guid:${guidKey}:${suffix}-->${content}`;
};

const toForwardCard = (payload: AnkiExportPayload, guidKey: string): { front: string; back: string } => {
  const front = addGuidMarker(
    `${payload.fields.Word}${FIELD_SEPARATOR}${payload.fields.Context}`,
    guidKey,
    'f'
  );
  const back = `${payload.fields.Back}${FIELD_SEPARATOR}${payload.fields.notes}`;
  return { front, back };
};

const toReverseCard = (payload: AnkiExportPayload, guidKey: string): { front: string; back: string } => {
  const front = addGuidMarker(payload.fields.Back, guidKey, 'r');
  const back = `${payload.fields.Word}${FIELD_SEPARATOR}${payload.fields.Context}${FIELD_SEPARATOR}${payload.fields.notes}`;
  return { front, back };
};

const shouldIncludeReverse = (payload: AnkiExportPayload): boolean => {
  const marker = normalizeField(payload.fields['Add Reverse']);
  return REVERSE_FIELD_TOKEN.test(marker);
};

const patchDeckAndModelIdentifiers = (
  exporter: AnkiExportInstance,
  deckId: number,
  modelId: number,
  deckName: string,
  modelName: string
): void => {
  exporter.topDeckId = deckId;
  exporter.topModelId = modelId;

  const decks = exporter._getInitialRowValue('col', 'decks');
  const deck = Object.values(decks)[0] || {};
  const nextDecks: Record<string, Record<string, unknown>> = {
    [String(deckId)]: {
      ...deck,
      id: deckId,
      name: deckName,
    },
  };
  exporter._update('update col set decks=:decks where id=1', {
    ':decks': JSON.stringify(nextDecks),
  });

  const models = exporter._getInitialRowValue('col', 'models');
  const model = Object.values(models)[0] || {};
  const nextModels: Record<string, Record<string, unknown>> = {
    [String(modelId)]: {
      ...model,
      id: modelId,
      did: deckId,
      name: modelName,
    },
  };
  exporter._update('update col set models=:models where id=1', {
    ':models': JSON.stringify(nextModels),
  });
};

const patchGuidGeneration = (exporter: AnkiExportInstance, deckId: number): void => {
  exporter._getNoteGuid = (_deckId: number, front: string, back: string): string => {
    const marker = /<!--adf-guid:([^:>]+):([fr])-->/.exec(front);
    if (marker?.[1]) {
      return createHash('sha1').update(`${deckId}:${marker[1]}:${marker[2]}`).digest('hex');
    }

    return createHash('sha1').update(`${deckId}:${front}:${back}`).digest('hex');
  };
};

const createExporter = (deckName: string): AnkiExportInstance => {
  return createAnkiExport(deckName, {
    questionFormat: '{{Front}}',
    answerFormat: '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}',
    css: DEFAULT_CARD_CSS,
  });
};

const normalizeTags = (tags: string[] | undefined): string[] => {
  if (!Array.isArray(tags)) return [];
  return tags.map(tag => tag.trim()).filter(Boolean);
};

const normalizeFileName = (value: string): string => {
  const safe = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (!safe) return DEFAULT_FILE_NAME;
  return safe.toLowerCase().endsWith('.apkg') ? safe : `${safe}.apkg`;
};

const buildApkgBuffer = async (payloads: AnkiExportPayload[]): Promise<Buffer> => {
  const first = payloads[0];
  const deckName = first.options.deckName.trim();
  const modelName = first.options.modelName.trim();
  const deckId = toStableIdentifier(`deck:${deckName}`);
  const modelId = toStableIdentifier(
    `model:${modelName}|fields:Word,Context,notes,Back,Add Reverse,Media|templates:forward+reverse`
  );

  const exporter = createExporter(deckName);
  patchDeckAndModelIdentifiers(exporter, deckId, modelId, deckName, modelName);
  patchGuidGeneration(exporter, deckId);

  for (const payload of payloads) {
    const guidKey = buildGuidKey(payload, deckName);
    const tags = normalizeTags(payload.options.tags);
    const forwardCard = toForwardCard(payload, guidKey);
    exporter.addCard(forwardCard.front, forwardCard.back, { tags });

    if (shouldIncludeReverse(payload)) {
      const reverseCard = toReverseCard(payload, guidKey);
      exporter.addCard(reverseCard.front, reverseCard.back, { tags });
    }
  }

  return exporter.save();
};

module.exports = {
  buildApkgBuffer,
  normalizeApkgFileName: normalizeFileName,
  toStableIdentifier,
  shouldIncludeReverse,
  buildGuidKey,
};

