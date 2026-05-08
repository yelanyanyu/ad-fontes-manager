const { buildTool } = require('./buildTool') as typeof import('./buildTool');

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const RATE_LIMIT = { perSecond: 1, perMonth: 15000 };
const requestCount = { second: 0, month: 0, lastReset: Date.now() };

function checkBraveRateLimit(): void {
  const now = Date.now();
  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }
  if (requestCount.second >= RATE_LIMIT.perSecond || requestCount.month >= RATE_LIMIT.perMonth) {
    throw new Error('Brave Search API rate limit exceeded');
  }
  requestCount.second += 1;
  requestCount.month += 1;
}

async function braveSearch(
  query: string,
  apiKey: string,
  domains: string[]
): Promise<SearchResult[]> {
  checkBraveRateLimit();
  const siteFilter = domains.length > 0 ? domains.map(domain => `site:${domain}`).join(' OR ') : '';
  const fullQuery = `${query} ${siteFilter}`.trim();
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(fullQuery)}&count=5`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Brave Search API returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };

  return (data.web?.results || []).map(result => ({
    title: result.title,
    url: result.url,
    snippet: result.description || '',
  }));
}

const searchEtymologyTool = buildTool({
  id: 'search_etymology',
  description: 'Search configured etymology sources for a word.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      language: { type: 'string', enum: ['en', 'de'] },
    },
    required: ['query', 'language'],
  },
  execute: async (input: { query: string; language: string }) => {
    const { getAIConfig } = require('../configService') as {
      getAIConfig: () => {
        search?: { apiKey?: string; domains?: Record<string, string[]> };
      };
    };
    const aiConfig = getAIConfig();
    if (!aiConfig.search?.apiKey) {
      throw new Error('Search API key not configured.');
    }
    const domains = aiConfig.search.domains || {};
    const allDomains = [
      ...(domains.common || []),
      ...(input.language === 'de' ? domains.de || [] : domains.en || []),
    ];
    return { results: await braveSearch(input.query, aiConfig.search.apiKey, allDomains) };
  },
});

module.exports = { searchEtymologyTool };
