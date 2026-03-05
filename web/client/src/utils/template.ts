type Context = Record<string, unknown> & { this?: unknown; '@root'?: unknown };

const MAX_LOOPS = 10000;

function escapeHtml(value: unknown): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeWithLineBreaks(value: unknown): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function getPath(obj: unknown, path: string): unknown {
  if (!path) return '';

  const context = (obj ?? {}) as Context;

  if (path === 'this') return context.this ?? '';
  if (path.startsWith('@root.')) {
    return getPath({ this: context['@root'], '@root': context['@root'] }, path.slice(6));
  }

  const parts = path.split('.');
  let cur: unknown = context;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur ?? '';
}

function stripDangerousHtml(html: unknown): string {
  return String(html ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['\"]).*?\1/gi, '');
}

type SectionType = 'if' | 'each';

interface SectionMatch {
  type: SectionType;
  index: number;
}

function findSection(template: string, startIndex: number): SectionMatch | null {
  const eachIdx = template.indexOf('{{#each', startIndex);
  const ifIdx = template.indexOf('{{#if', startIndex);

  if (eachIdx === -1 && ifIdx === -1) return null;
  if (eachIdx !== -1 && (ifIdx === -1 || eachIdx < ifIdx)) {
    return { type: 'each', index: eachIdx };
  }
  return { type: 'if', index: ifIdx };
}

interface ParsedTag {
  path: string;
  tagEnd: number;
}

function parseTag(template: string, tagStart: number, type: SectionType): ParsedTag | null {
  const close = template.indexOf('}}', tagStart);
  if (close === -1) return null;
  const raw = template.slice(tagStart + `{{#${type}`.length, close).trim();
  return { path: raw, tagEnd: close + 2 };
}

function findMatchingEnd(template: string, fromIndex: number, type: SectionType): number {
  const openTag = `{{#${type}`;
  const closeTag = `{{/${type}}}`;
  let depth = 1;
  let index = fromIndex;

  while (index < template.length) {
    const nextOpen = template.indexOf(openTag, index);
    const nextClose = template.indexOf(closeTag, index);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      index = nextOpen + openTag.length;
      continue;
    }

    depth -= 1;
    if (depth === 0) return nextClose;
    index = nextClose + closeTag.length;
  }

  return -1;
}

function renderSegments(template: string, ctx: Context): string {
  let out = '';
  let cursor = 0;
  let loopCount = 0;

  while (true) {
    if (++loopCount > MAX_LOOPS) {
      console.warn('Template render infinite loop detected');
      break;
    }

    const section = findSection(template, cursor);
    if (!section) {
      out += template.slice(cursor);
      break;
    }

    out += template.slice(cursor, section.index);

    const parsed = parseTag(template, section.index, section.type);
    if (!parsed) {
      out += template.slice(section.index);
      break;
    }

    const blockStart = parsed.tagEnd;
    const endIdx = findMatchingEnd(template, blockStart, section.type);
    if (endIdx === -1) {
      out += template.slice(section.index);
      break;
    }

    const inner = template.slice(blockStart, endIdx);
    const afterEnd = endIdx + `{{/${section.type}}}`.length;

    if (section.type === 'if') {
      const val = getPath(ctx, parsed.path);
      if (val) {
        out += renderSegments(inner, ctx);
      }
    } else {
      const arr = getPath(ctx, parsed.path);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const nextCtx: Context = {
            ...ctx,
            ...(item && typeof item === 'object' ? (item as Record<string, unknown>) : {}),
            this: item,
            '@root': ctx['@root'],
          };
          out += renderSegments(inner, nextCtx);
        }
      }
    }

    cursor = afterEnd;
  }

  out = out.replace(/\{\{\{([\s\S]+?)\}\}\}/g, (_, expr: string) => {
    const val = getPath(ctx, String(expr).trim());
    return stripDangerousHtml(String(val ?? ''));
  });

  out = out.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr: string) => {
    const val = getPath(ctx, String(expr).trim());
    return escapeWithLineBreaks(val);
  });

  return out;
}

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  const safeTemplate = stripDangerousHtml(template);
  const ctx: Context = { ...data, this: data, '@root': data };
  return renderSegments(safeTemplate, ctx);
}
