import { marked } from 'marked';

interface ReleaseNotesInfo {
  releaseNotesText: string;
  releaseNotesFormat: 'html' | 'markdown' | 'text';
}

export function renderReleaseNotesHtml(info: ReleaseNotesInfo | null | undefined): string {
  if (!info?.releaseNotesText.trim()) return '<p>暂无更新说明。</p>';

  if (info.releaseNotesFormat === 'html') {
    return sanitizeHtml(info.releaseNotesText);
  }

  if (info.releaseNotesFormat === 'markdown') {
    return sanitizeHtml(marked.parse(info.releaseNotesText, { async: false }) as string);
  }

  return `<p>${escapeHtml(info.releaseNotesText)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHtml(html: string): string {
  const allowedTags = new Set([
    'A',
    'BLOCKQUOTE',
    'BR',
    'CODE',
    'EM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'LI',
    'OL',
    'P',
    'PRE',
    'STRONG',
    'UL',
  ]);
  const template = document.createElement('template');
  template.innerHTML = html;

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (!allowedTags.has(element.tagName)) {
          element.replaceWith(document.createTextNode(element.textContent || ''));
          continue;
        }

        for (const attribute of Array.from(element.attributes)) {
          const name = attribute.name.toLowerCase();
          const value = attribute.value;
          if (element.tagName === 'A' && name === 'href' && /^https?:\/\//i.test(value)) {
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noreferrer');
            continue;
          }
          element.removeAttribute(attribute.name);
        }
      }
      walk(child);
    }
  };

  walk(template.content);
  return template.innerHTML.trim() || '<p>暂无更新说明。</p>';
}
