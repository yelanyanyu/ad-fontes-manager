function escapeHtml(value) {
    const str = String(value ?? '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeWithLineBreaks(value) {
    return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function getPath(obj, path) {
    if (!path) return '';
    if (path === 'this') return obj?.this ?? '';
    if (path.startsWith('@root.')) {
        return getPath({ this: obj?.['@root'], '@root': obj?.['@root'] }, path.slice(6));
    }
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return '';
        cur = cur[p];
    }
    return cur ?? '';
}

function stripDangerousHtml(html) {
    return String(html ?? '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
}

function findSection(template, startIndex) {
    const eachIdx = template.indexOf('{{#each', startIndex);
    const ifIdx = template.indexOf('{{#if', startIndex);
    if (eachIdx === -1 && ifIdx === -1) return null;
    if (eachIdx !== -1 && (ifIdx === -1 || eachIdx < ifIdx)) return { type: 'each', index: eachIdx };
    return { type: 'if', index: ifIdx };
}

function parseTag(template, tagStart, type) {
    const close = template.indexOf('}}', tagStart);
    if (close === -1) return null;
    const raw = template.slice(tagStart + (`{{#${type}`.length), close).trim();
    return { path: raw, tagEnd: close + 2 };
}

function findMatchingEnd(template, fromIndex, type) {
    const openTag = `{{#${type}`;
    const closeTag = `{{/${type}}}`;
    let depth = 1;
    let i = fromIndex;
    while (i < template.length) {
        const nextOpen = template.indexOf(openTag, i);
        const nextClose = template.indexOf(closeTag, i);
        if (nextClose === -1) return -1;
        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth += 1;
            i = nextOpen + openTag.length;
            continue;
        }
        depth -= 1;
        if (depth === 0) return nextClose;
        i = nextClose + closeTag.length;
    }
    return -1;
}

function renderSegments(template, ctx) {
    let out = '';
    let cursor = 0;
    let loopCount = 0;
    const MAX_LOOPS = 10000;

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
            if (val) out += renderSegments(inner, ctx);
        } else if (section.type === 'each') {
            const arr = getPath(ctx, parsed.path);
            if (Array.isArray(arr)) {
                for (const item of arr) {
                    const nextCtx = {
                        ...ctx,
                        ...(item && typeof item === 'object' ? item : {}),
                        this: item,
                        '@root': ctx['@root']
                    };
                    out += renderSegments(inner, nextCtx);
                }
            }
        }

        cursor = afterEnd;
    }

    out = out.replace(/\{\{\{([\s\S]+?)\}\}\}/g, (_, expr) => {
        const val = getPath(ctx, String(expr).trim());
        return stripDangerousHtml(String(val ?? ''));
    });

    out = out.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr) => {
        const val = getPath(ctx, String(expr).trim());
        return escapeWithLineBreaks(val);
    });

    return out;
}

export function renderTemplate(template, data) {
    const safeTemplate = stripDangerousHtml(template);
    const ctx = { ...data, this: data, '@root': data };
    return renderSegments(safeTemplate, ctx);
}
