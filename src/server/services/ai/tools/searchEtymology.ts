const { buildTool } = require('./buildTool') as typeof import('./buildTool');

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const BRAVE_RATE = { perSecond: 1, perMonth: 15000 };
const braveCount = { second: 0, month: 0, lastReset: Date.now() };

function checkBraveRateLimit(): void {
  const now = Date.now();
  if (now - braveCount.lastReset > 1000) {
    braveCount.second = 0;
    braveCount.lastReset = now;
  }
  if (braveCount.second >= BRAVE_RATE.perSecond || braveCount.month >= BRAVE_RATE.perMonth) {
    throw new Error('Brave Search API rate limit exceeded');
  }
  braveCount.second += 1;
  braveCount.month += 1;
}

async function braveSearch(
  query: string,
  apiKey: string,
  domains: string[]
): Promise<SearchResult[]> {
  checkBraveRateLimit();
  const siteFilter = domains.length > 0 ? domains.map(d => `site:${d}`).join(' OR ') : '';
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

  return (data.web?.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
  }));
}

async function tavilySearch(
  query: string,
  apiKey: string,
  domains: string[]
): Promise<SearchResult[]> {
  const body: Record<string, unknown> = {
    query,
    api_key: apiKey,
    search_depth: 'basic',
    max_results: 5,
  };
  if (domains.length > 0) {
    body.include_domains = domains;
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Tavily Search API returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title: string; url: string; content: string }>;
  };

  return (data.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
  }));
}

export const searchEtymologyTool = buildTool({
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
        search?: {
          provider?: 'brave' | 'tavily';
          apiKey?: string;
          domains?: Record<string, string[]>;
        };
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

    const provider = aiConfig.search.provider || 'brave';
    if (provider === 'tavily') {
      return { results: await tavilySearch(input.query, aiConfig.search.apiKey, allDomains) };
    }
    return { results: await braveSearch(input.query, aiConfig.search.apiKey, allDomains) };
  },
});

module.exports = { searchEtymologyTool };
