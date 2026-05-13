const cheerio = require('cheerio') as typeof import('cheerio');
const { buildTool } = require('./buildTool') as typeof import('./buildTool');

function cleanText(html: string, maxLength = 4000): string {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, .sidebar, #sidebar, .nav, .menu').remove();
  const body = $('body').text() || $('main').text() || $.text();
  const cleaned = body
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

export const fetchPageTool = buildTool({
  id: 'fetch_page',
  description: 'Fetch and extract clean text from a web page URL.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri' },
    },
    required: ['url'],
  },
  execute: async (input: { url: string }, signal: AbortSignal) => {
    const response = await fetch(input.url, {
      headers: {
        'User-Agent': 'AdFontesManager/1.0 (etymology research tool)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${input.url}: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    return {
      url: input.url,
      title: $('title').text().trim() || input.url,
      content: cleanText(html),
    };
  },
});

module.exports = { fetchPageTool };
