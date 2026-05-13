import { createHash } from 'node:crypto';

type AnkiTargetFields = Record<string, string>;

type AnkiExportPayload = {
  fields: AnkiTargetFields;
  options: {
    deckName: string;
    modelName: string;
    tags: string[];
  };
  sourceWordId?: string;
  sourceLemma?: string;
};

type SelectedTemplate = {
  name: string;
  front: string;
  back: string;
};

type BuildApkgInput = {
  payloads: AnkiExportPayload[];
  modelFields: string[];
  selectedTemplate: SelectedTemplate;
  css: string;
};

type TemplateConfig = {
  questionFormat?: string;
  answerFormat?: string;
  css?: string;
};

type AnkiExportInstance = {
  topDeckId: number;
  topModelId: number;
  separator: string;
  db: {
    prepare: (query: string) => { getAsObject: (params?: Record<string, unknown>) => unknown };
    exec: (query: string) => Array<{ values: unknown[][] }>;
  };
  _getInitialRowValue: (table: string, column: string) => Record<string, Record<string, unknown>>;
  _update: (query: string, params: Record<string, unknown>) => void;
  _getId: (table: string, col: string, ts: number) => number;
  save: () => Promise<Buffer>;
};

// anki-apkg-export loads sql.js with a 16 MB WASM heap limit by default.
// Redirect to the memory-growth build so large exports (300+ cards) don't OOM.
type ResolveFilename = (
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: { paths?: string[] }
) => string;

const Module = require('module') as {
  _resolveFilename: ResolveFilename;
};
const _sqlResolveOrig = Module._resolveFilename;
Module._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: { paths?: string[] }
) {
  if (request === 'sql.js') {
    return _sqlResolveOrig.call(this, 'sql.js/js/sql-memory-growth.js', parent, isMain, options);
  }
  return _sqlResolveOrig.call(this, request, parent, isMain, options);
};

const { default: createAnkiExport } = require('anki-apkg-export') as {
  default: (deckName: string, template?: TemplateConfig) => AnkiExportInstance;
};

Module._resolveFilename = _sqlResolveOrig;

const DEFAULT_FILE_NAME = 'ad-fontes-export.apkg';

const toPositive32Int = (key: string): number => {
  const digest = createHash('sha1').update(key).digest();
  return digest.readUInt32BE(0) & 0x7fffffff;
};

const toStableIdentifier = (key: string): number => {
  // Keep ids in a high range to avoid clashing with template defaults.
  return 1_000_000_000 + (toPositive32Int(key) % 1_000_000_000);
};

const normalizeField = (value: string | undefined): string => String(value || '').trim();

const buildGuidKey = (
  payload: AnkiExportPayload,
  deckName: string,
  primaryFieldName = ''
): string => {
  const sourceWordId = normalizeField(payload.sourceWordId);
  if (sourceWordId) return sourceWordId;

  const sourceLemma = normalizeField(payload.sourceLemma);
  if (sourceLemma) return `${sourceLemma}::${deckName}`;

  const primaryFieldValue = normalizeField(payload.fields[primaryFieldName]);
  if (primaryFieldValue) return `${primaryFieldValue}::${deckName}`;

  const fallbackValue = Object.values(payload.fields).map(normalizeField).find(Boolean);
  return `${fallbackValue || 'unknown'}::${deckName}`;
};

const createFieldDefinition = (name: string, ord: number): Record<string, unknown> => ({
  name,
  media: [],
  sticky: false,
  rtl: false,
  ord,
  font: 'Arial',
  size: 20,
});

const createTemplateDefinition = (selectedTemplate: SelectedTemplate): Record<string, unknown> => ({
  name: selectedTemplate.name,
  qfmt: selectedTemplate.front,
  did: null,
  bafmt: '',
  afmt: selectedTemplate.back,
  ord: 0,
  bqfmt: '',
});

const patchDeckAndModelIdentifiers = (
  exporter: AnkiExportInstance,
  deckId: number,
  modelId: number,
  deckName: string,
  modelName: string,
  modelFields: string[],
  selectedTemplate: SelectedTemplate,
  css: string
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
      sortf: 0,
      css,
      flds: modelFields.map((fieldName, index) => createFieldDefinition(fieldName, index)),
      tmpls: [createTemplateDefinition(selectedTemplate)],
      req: [[0, 'all', [0]]],
    },
  };
  exporter._update('update col set models=:models where id=1', {
    ':models': JSON.stringify(nextModels),
  });
};

const createExporter = (deckName: string, css: string): AnkiExportInstance => {
  return createAnkiExport(deckName, {
    questionFormat: '{{Front}}',
    answerFormat: '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}',
    css,
  });
};

const normalizeTags = (tags: string[] | undefined): string[] => {
  if (!Array.isArray(tags)) return [];
  return tags.map(tag => tag.trim()).filter(Boolean);
};

const normalizeFileName = (value: string): string => {
  const safe = String(value || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (!safe) return DEFAULT_FILE_NAME;
  return safe.toLowerCase().endsWith('.apkg') ? safe : `${safe}.apkg`;
};

const checksum = (value: string): number => {
  return parseInt(createHash('sha1').update(value).digest('hex').slice(0, 8), 16);
};

const toTagsString = (tags: string[]): string => {
  if (!tags.length) return '';
  return ` ${tags.map(tag => tag.replace(/ /g, '_')).join(' ')} `;
};

const getObjectIdValue = (row: unknown, key: string): number | null => {
  if (!row || typeof row !== 'object') return null;
  const value = (row as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const findExistingNoteId = (exporter: AnkiExportInstance, guid: string): number | null => {
  const row = exporter.db
    .prepare('SELECT id from notes WHERE guid = :guid ORDER BY id DESC LIMIT 1')
    .getAsObject({ ':guid': guid });
  return getObjectIdValue(row, 'id');
};

const findExistingCardId = (exporter: AnkiExportInstance, noteId: number): number | null => {
  const row = exporter.db
    .prepare('SELECT id from cards WHERE nid = :nid AND ord = 0 ORDER BY id DESC LIMIT 1')
    .getAsObject({ ':nid': noteId });
  return getObjectIdValue(row, 'id');
};

const toNoteFieldPayload = (
  payload: AnkiExportPayload,
  modelFields: string[],
  separator: string
): { flds: string; sfld: string } => {
  const fieldValues = modelFields.map(fieldName => String(payload.fields[fieldName] || ''));
  const sfld = fieldValues[0] || '';
  return {
    flds: fieldValues.join(separator),
    sfld,
  };
};

const upsertNoteAndCard = (
  exporter: AnkiExportInstance,
  payload: AnkiExportPayload,
  modelFields: string[],
  deckId: number,
  modelId: number,
  guidKey: string
): void => {
  const now = Date.now();
  const guid = createHash('sha1').update(`${deckId}:${guidKey}`).digest('hex');
  const existingNoteId = findExistingNoteId(exporter, guid);
  const noteId = existingNoteId ?? exporter._getId('notes', 'id', now);
  const { flds, sfld } = toNoteFieldPayload(payload, modelFields, exporter.separator);
  const tags = toTagsString(normalizeTags(payload.options.tags));

  exporter._update(
    'insert or replace into notes values(:id,:guid,:mid,:mod,:usn,:tags,:flds,:sfld,:csum,:flags,:data)',
    {
      ':id': noteId,
      ':guid': guid,
      ':mid': modelId,
      ':mod': exporter._getId('notes', 'mod', now),
      ':usn': -1,
      ':tags': tags,
      ':flds': flds,
      ':sfld': sfld,
      ':csum': checksum(flds),
      ':flags': 0,
      ':data': '',
    }
  );

  const existingCardId = findExistingCardId(exporter, noteId);
  const cardId = existingCardId ?? exporter._getId('cards', 'id', now);
  exporter._update(
    'insert or replace into cards values(:id,:nid,:did,:ord,:mod,:usn,:type,:queue,:due,:ivl,:factor,:reps,:lapses,:left,:odue,:odid,:flags,:data)',
    {
      ':id': cardId,
      ':nid': noteId,
      ':did': deckId,
      ':ord': 0,
      ':mod': exporter._getId('cards', 'mod', now),
      ':usn': -1,
      ':type': 0,
      ':queue': 0,
      ':due': 179,
      ':ivl': 0,
      ':factor': 0,
      ':reps': 0,
      ':lapses': 0,
      ':left': 0,
      ':odue': 0,
      ':odid': 0,
      ':flags': 0,
      ':data': '',
    }
  );
};

const buildApkgBuffer = async (input: BuildApkgInput): Promise<Buffer> => {
  const { payloads, modelFields, selectedTemplate, css } = input;
  const first = payloads[0];
  const deckName = first.options.deckName.trim();
  const modelName = first.options.modelName.trim();
  const deckId = toStableIdentifier(`deck:${deckName}`);
  const modelId = toStableIdentifier(
    `model:${modelName}|fields:${modelFields.join(',')}|template:${selectedTemplate.name}|${selectedTemplate.front}|${selectedTemplate.back}`
  );

  const exporter = createExporter(deckName, css);
  patchDeckAndModelIdentifiers(
    exporter,
    deckId,
    modelId,
    deckName,
    modelName,
    modelFields,
    selectedTemplate,
    css
  );

  exporter.db.run('BEGIN TRANSACTION');

  for (const payload of payloads) {
    const guidKey = buildGuidKey(payload, deckName, modelFields[0] || '');
    upsertNoteAndCard(exporter, payload, modelFields, deckId, modelId, guidKey);
  }

  exporter.db.run('COMMIT');

  return exporter.save();
};

module.exports = {
  buildApkgBuffer,
  normalizeApkgFileName: normalizeFileName,
  toStableIdentifier,
  buildGuidKey,
};
