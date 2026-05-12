export interface BatchGenerateDraftItem {
  word: string;
  context?: string;
  notes?: string;
}

export interface BatchGenerateParseResult {
  items: BatchGenerateDraftItem[];
  invalid: string[];
}

type UnknownRecord = Record<string, unknown>;

const cleanOptional = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeItem = (raw: UnknownRecord, label: string): BatchGenerateParseResult => {
  const word = cleanOptional(raw.word ?? raw.lemma);
  if (!word) {
    return { items: [], invalid: [`${label}: missing word`] };
  }
  return {
    items: [
      {
        word,
        context: cleanOptional(raw.context),
        notes: cleanOptional(raw.notes),
      },
    ],
    invalid: [],
  };
};

const parseKeyValueBlock = (block: string, index: number): BatchGenerateParseResult => {
  const raw: UnknownRecord = {};
  const looseLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(word|lemma|context|notes)\s*:\s*(.*)$/i);
    if (match) {
      raw[match[1].toLowerCase() === 'lemma' ? 'word' : match[1].toLowerCase()] = match[2];
    } else {
      looseLines.push(trimmed);
    }
  }

  if (!raw.word && looseLines[0]) {
    raw.word = looseLines[0];
  }
  if (!raw.context && looseLines.length > 1) {
    raw.context = looseLines.slice(1).join(' ');
  }

  return normalizeItem(raw, `item ${index + 1}`);
};

const parsePipeLine = (line: string, index: number): BatchGenerateParseResult => {
  const [word, context, notes] = line.split('|').map(part => part.trim());
  return normalizeItem({ word, context, notes }, `line ${index + 1}`);
};

export function parseBatchText(input: string): BatchGenerateParseResult {
  const text = input.trim();
  if (!text) return { items: [], invalid: [] };

  const blocks = text
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);
  const simpleLineMode =
    blocks.length === 1 &&
    !/[|:]/.test(blocks[0]) &&
    blocks[0].split(/\r?\n/).filter(Boolean).length > 1;

  const units = simpleLineMode ? blocks[0].split(/\r?\n/).map(line => line.trim()) : blocks;
  const result: BatchGenerateParseResult = { items: [], invalid: [] };

  units.forEach((unit, index) => {
    const parsed = unit.includes('|')
      ? parsePipeLine(unit, index)
      : parseKeyValueBlock(unit, index);
    result.items.push(...parsed.items);
    result.invalid.push(...parsed.invalid);
  });

  return result;
}

export function parseBatchJson(input: string): BatchGenerateParseResult {
  if (!input.trim()) return { items: [], invalid: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return {
      items: [],
      invalid: [error instanceof Error ? error.message : 'Invalid JSON'],
    };
  }

  const items: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as UnknownRecord).items)
      ? ((parsed as UnknownRecord).items as unknown[])
      : null;

  if (!items) {
    return { items: [], invalid: ['JSON must be an array or an object with an items array'] };
  }

  const result: BatchGenerateParseResult = { items: [], invalid: [] };
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      result.invalid.push(`item ${index + 1}: expected object`);
      return;
    }
    const normalized = normalizeItem(item as UnknownRecord, `item ${index + 1}`);
    result.items.push(...normalized.items);
    result.invalid.push(...normalized.invalid);
  });

  return result;
}
