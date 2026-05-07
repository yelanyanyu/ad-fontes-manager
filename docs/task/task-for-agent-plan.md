# AI 单词语法生成 — 最小可行性验证 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Home 页面 YAML Editor 中嵌入 AI 生成模块，跑通单单词 Research → Enrichment → Review 管道，SSE 实时推送进度。

**Architecture:** Vercel AI SDK (`generateText`) 直接调用，`SequentialRunner` 顺序编排 3 个 stage。`PipelineDefinition` + `PipelineRunner` 接口做抽象层，后续换 Mastra 只需新 Runner 实现。配置层 Zod schema + config.json + env override。SSE 推送每步进度给 `useAiGenerate()` composable，`AiGenerateBar.vue` 渲染。

**Tech Stack:** `ai` + `@ai-sdk/openai`, SSE, Vue 3 + Pinia, Zod, Pino, cheerio

**Design doc:** `docs/task/task-for-agent.md`

### 参考实现

从 `claude-code` 和 `cherry-studio` 学到的模式，有机融入（非教条式照搬）：

| 模式 | 来源 | 融合方式 |
|------|------|---------|
| `buildTool()` 错误处理 | claude-code `src/Tool.ts` | `buildAITool()` wrapper: 超时/退避重试/结构化 `{success,data,errorCode}` 返回，不 throw |
| SSE keepalive + abort 清理 | claude-code `sse-writer.ts` | Task 8 加 15s keepalive heartbeat，`req.on('close')` + `req.on('aborted')` 双重清理 |
| `provider:model` 路由 | cherry-studio `chat-completion.ts` | `modelResolver.resolveModel(stageName)` 集中解析，返回 `{apiKey, baseUrl, format}` |
| Rate limiter | cherry-studio `brave-search.ts` | searchEtymology 工具内置 per-second + per-month 限流 |
| 顺序编排 (放弃 Mastra) | 自主判断 | 3 步线性管道用 Mastra 是过度抽象；`SequentialRunner` 简化代码量同时保留 `PipelineRunner` 接口为后续扩展点 |

---

### Task 1: AI 配置 Schema + Config 扩展

**Files:**
- Create: `src/server/schemas/aiConfig.ts`
- Modify: `src/server/schemas/config.ts`
- Modify: `src/server/utils/config.ts`

- [x] **Step 1: Write AI config Zod schema** ✅ 已实现

当前实现于 `src/server/schemas/aiConfig.ts`。与原始计划的差异：
- Provider 用 `type: 'openai' | 'anthropic'` 替代 `formats` 数组
- 阶段键改为 `fast/balanced/expert`（三档配置）
- 额外包含 `TestProviderInputSchema` 和 `TestSearchInputSchema`

- [ ] **Step 2: Add AI config to top-level ConfigSchema**

Modify `src/server/schemas/config.ts` — add import and `ai` field:

```typescript
// Add after existing imports:
import { AIConfigSchema } from './aiConfig';

// Add inside z.object({...}) after security block:
    ai: AIConfigSchema.optional(),
```

- [ ] **Step 3: Add AI config defaults, env mapping, and accessors**

Modify `src/server/utils/config.ts`:

Add to `defaultConfig` after `security` block:

```typescript
  ai: {
    providers: [],
    stages: {},
    review: {
      threshold: 6,
      thresholdByLanguage: {},
    },
  },
```

Add to `envMapping`:

```typescript
  AI_SEARCH_API_KEY: 'ai.search.apiKey',
  AI_SEARCH_PROVIDER: 'ai.search.provider',
  AI_REVIEW_THRESHOLD: 'ai.review.threshold',
```

Add convenience functions before `module.exports`:

```typescript
function getAIConfig(): AIConfig | undefined {
  return get<AIConfig | undefined>('ai', undefined);
}

function getAPIKeyMasked(config: AIConfig): AIConfig {
  if (!config) return config;
  return {
    ...config,
    providers: config.providers?.map(p => ({
      ...p,
      apiKey: p.apiKey ? 'sk-***' + p.apiKey.slice(-4) : '',
    })) || [],
    search: config.search ? {
      ...config.search,
      apiKey: config.search.apiKey ? '***' + config.search.apiKey.slice(-4) : '',
    } : undefined,
  };
}
```

Add to `module.exports`:

```typescript
  getAIConfig,
  getAPIKeyMasked,
```

- [ ] **Step 4: Verify config compiles**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | Select-String "aiConfig|config.ts"
```

Expected: no errors matching `aiConfig` or `config.ts`.

---

### Task 2: AI 模块 Logger ✅ 已实现

**Files:**
- Modify: `src/server/utils/logger.ts`

- [x] **Step 1: Add `loggers.ai`**

Add to the `loggers` object:

```typescript
  ai: createModuleLogger('ai'),
```

- [ ] **Step 2: Verify logger compiles**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | Select-String "logger"
```

Expected: no errors for `logger.ts`.

---

### Task 3: Mock Prompt 文件

**Files:**
- Create: `docs/prompts/english-generation.md`
- Create: `docs/prompts/content-reviewer.md`

- [ ] **Step 1: Create mock research/enrichment prompt**

Create `docs/prompts/english-generation.md`:

```markdown
# English Word Etymology Generation

## Task
Generate a YAML entry for the word "{{word}}".
Language: {{language}}
Context: {{context}}
User notes: {{notes}}

## Instructions
This is a TEST mock prompt. Return a minimal valid YAML with these fields:
- yield.language: "{{language}}"
- lemma: "{{word}}"
- historical_origins: "HELLO FROM RESEARCH AGENT"

For enrichment step, also include:
- visual_imagery_zh: "测试视觉意象"
- meaning_evolution_zh: "HELLO FROM ENRICHMENT AGENT"
- image_differentiation_zh: "测试意象区分"

Return ONLY valid YAML, no markdown fences.
```

- [ ] **Step 2: Create mock reviewer prompt**

Create `docs/prompts/content-reviewer.md`:

```markdown
# Content Review

## Task
Review the following YAML entry and score 3 fields (1-10):
- visual_imagery_zh
- meaning_evolution_zh
- image_differentiation_zh

YAML to review:
```yaml
{{yaml}}
```

Return ONLY valid JSON (no markdown fences):
{
  "field_scores": {
    "visual_imagery_zh": {"score": 7, "positive": ["Mock positive feedback"], "negative": ["Mock suggestion"]},
    "meaning_evolution_zh": {"score": 7, "positive": ["Mock positive feedback"], "negative": ["Mock suggestion"]},
    "image_differentiation_zh": {"score": 7, "positive": ["Mock positive feedback"], "negative": ["Mock suggestion"]}
  },
  "overall_assessment": "Mock assessment - prompts will be replaced with real content."
}
```

- [ ] **Step 3: Verify prompt files exist**

```bash
Get-ChildItem docs/prompts/english-generation.md, docs/prompts/content-reviewer.md
```

Expected: both files listed.

---

### Task 4: Pipeline 类型定义 + Prompt Loader

**Files:**
- Create: `src/server/services/ai/types.ts`
- Create: `src/server/services/ai/prompts/loader.ts`

- [ ] **Step 1: Create pipeline types**

Create `src/server/services/ai/types.ts`:

```typescript
import type { z } from 'zod';

export interface PipelineStage {
  id: string;
  description: string;
  type: 'llm' | 'validate';    // 'llm' = call model; 'validate' = Zod schema check (Phase 2)
  modelKey?: 'fast' | 'balanced' | 'expert';
  systemPromptFile?: string;    // undefined for validate stages
  toolNames?: string[];
  outputParser?: (text: string) => Record<string, unknown>;
  schemaName?: string;          // Zod schema name for validate stages (Phase 2)
  retry?: { maxAttempts: number; fixerStageId?: string };  // Phase 2
}

export interface PipelineDefinition {
  id: string;
  language: string;
  stages: PipelineStage[];
}

export interface StepResult {
  step: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  summary?: string;
  result?: unknown;
  error?: string;
}

export interface PipelineContext {
  word: string;
  context: string;
  language: string;
  notes: string;
  searchSummary?: string;
  researchYaml?: string;
  fullYaml?: string;
  scores?: Record<string, unknown>;
}

export interface PipelineJob {
  jobId: string;
  word: string;
  language: string;
  context?: string;
  notes?: string;
  status: 'queued' | 'running' | 'complete' | 'error';
  steps: StepResult[];
  currentStep?: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
  result?: {
    yaml: string;
    scores: Record<string, unknown>;
  };
}

export type PipelineProgressEvent =
  | { type: 'step:start'; step: string; message: string }
  | { type: 'step:tokens'; step: string; chunk: string }
  | { type: 'step:complete'; step: string; duration: number; summary: string; result?: unknown }
  | { type: 'step:error'; step: string; error: string; willRetry: boolean }
  | { type: 'pipeline:complete'; yaml: string; scores: Record<string, unknown>; totalDuration: number };

export interface PipelineRunner {
  run(params: {
    definition: PipelineDefinition;
    input: { word: string; context?: string; language: string; notes?: string };
    onProgress: (event: PipelineProgressEvent) => void;
  }): Promise<{ yaml: string; scores: Record<string, unknown> }>;
}
```

- [ ] **Step 2: Create prompt loader**

Create `src/server/services/ai/prompts/loader.ts`:

```typescript
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const promptsDir = path.resolve(process.cwd(), 'docs', 'prompts');
const templateCache = new Map<string, string>();

function loadPromptFile(filename: string): string {
  const filePath = path.join(promptsDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function getPrompt(filename: string): string {
  if (!templateCache.has(filename)) {
    templateCache.set(filename, loadPromptFile(filename));
  }
  return templateCache.get(filename)!;
}

function injectVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function loadSystemPrompt(filename: string, variables: Record<string, string>): string {
  const template = getPrompt(filename);
  return injectVariables(template, variables);
}

function clearCache(): void {
  templateCache.clear();
}

module.exports = { loadSystemPrompt, clearCache };
```

- [ ] **Step 3: Verify types and loader compile**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | Select-String "types\.ts|loader\.ts"
```

Expected: no errors.

---

### Task 5: AI 工具基础设施 + 搜索工具

**Files:**
- Create: `src/server/services/ai/tools/buildTool.ts`
- Create: `src/server/services/ai/tools/searchEtymology.ts`
- Create: `src/server/services/ai/tools/fetchPage.ts`

- [ ] **Step 1: Create `buildTool()` wrapper**

creates `src/server/services/ai/tools/buildTool.ts`.

Wraps tool execution with: configurable timeout (default 30s), retry with exponential backoff (rate limit / 5xx), structured `{success, data?, errorCode?, errorMessage?}` return (never throws), auto-logging to `loggers.ai`.

```typescript
const { loggers } = require('../../utils/logger');

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
}

interface BuildToolOptions<TInput, TOutput> {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: TInput) => Promise<TOutput>;
  timeoutMs?: number;
  maxRetries?: number;
}

function classifyError(err: unknown): { errorCode: string; willRetry: boolean } {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
      return { errorCode: 'rate_limit', willRetry: true };
    }
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return { errorCode: 'provider_5xx', willRetry: true };
    }
    if (msg.includes('timeout') || msg.includes('abort')) {
      return { errorCode: 'timeout', willRetry: false };
    }
    return { errorCode: 'tool_error', willRetry: false };
  }
  return { errorCode: 'unknown_error', willRetry: false };
}

async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BACKOFF_SCHEDULE = [2000, 8000];

export function buildTool<TInput, TOutput>(options: BuildToolOptions<TInput, TOutput>) {
  const { id, description, inputSchema, execute, timeoutMs = 30000, maxRetries = 2 } = options;

  async function run(input: TInput): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await executeWithTimeout(() => execute(input), timeoutMs);
        loggers.ai.info({ tool: id, event: 'complete', durationMs: Date.now() - startTime, attempt: attempt + 1 });
        return { success: true, data };
      } catch (err) {
        lastError = err;
        const { errorCode, willRetry } = classifyError(err);
        if (willRetry && attempt < maxRetries) {
          const delay = BACKOFF_SCHEDULE[attempt] || BACKOFF_SCHEDULE[BACKOFF_SCHEDULE.length - 1];
          loggers.ai.warn({ tool: id, event: 'retry', errorCode, attempt: attempt + 1, delayMs: delay });
          await sleep(delay);
          continue;
        }
        loggers.ai.error({ tool: id, event: 'error', errorCode, durationMs: Date.now() - startTime, error: err instanceof Error ? err.message : String(err) });
        return { success: false, errorCode, errorMessage: err instanceof Error ? err.message : String(err) };
      }
    }
    return { success: false, errorCode: 'max_retries_exceeded', errorMessage: lastError instanceof Error ? lastError.message : String(lastError) };
  }

  return { id, description, inputSchema, run };
}
```

- [ ] **Step 2: Create searchEtymology tool**

Create `src/server/services/ai/tools/searchEtymology.ts`:

```typescript
import { buildTool } from './buildTool';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Rate limiter (per cherry-studio brave-search.ts:77-88)
const RATE_LIMIT = { perSecond: 1, perMonth: 15000 };
const requestCount = { second: 0, month: 0, lastReset: Date.now() };
function checkBraveRateLimit() {
  const now = Date.now();
  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }
  if (requestCount.second >= RATE_LIMIT.perSecond || requestCount.month >= RATE_LIMIT.perMonth) {
    throw new Error('Brave Search API rate limit exceeded');
  }
  requestCount.second++;
  requestCount.month++;
}

async function braveSearch(query: string, apiKey: string, domains: string[]): Promise<SearchResult[]> {
  checkBraveRateLimit();
  const siteFilter = domains.map(d => `site:${d}`).join(' OR ');
  const fullQuery = `${query} ${siteFilter}`;

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(fullQuery)}&count=5`,
    {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Brave Search API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as {
    web?: { results?: Array<{ title: string; url: string; description: string }> };
  };

  return (data.web?.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
  }));
}

export const searchEtymologyTool = buildTool({
  id: 'search_etymology',
  description: 'Search etymology websites for a given word. Returns titles, URLs, and snippets from configured etymology sources.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query, e.g. "apple etymology origin"' },
      language: { type: 'string', enum: ['en', 'de'], description: 'Language code for domain selection' },
    },
    required: ['query', 'language'],
  },
  execute: async (input: { query: string; language: string }) => {
    const { query, language } = input;
    const config = require('../../utils/config') as {
      getAIConfig: () => { search?: { apiKey?: string; domains?: Record<string, string[]> } } | undefined;
    };
    const aiConfig = config.getAIConfig();
    if (!aiConfig?.search?.apiKey) {
      throw new Error('Search API key not configured.');
    }
    const domains = aiConfig.search.domains || {};
    const allDomains = [...(domains.common || []), ...(language === 'de' ? (domains.de || []) : (domains.en || []))];
    const results = await braveSearch(query, aiConfig.search.apiKey, allDomains);
    return { results };
  },
});
```

- [ ] **Step 3: Create fetchPage tool**

Create `src/server/services/ai/tools/fetchPage.ts`:

```typescript
import { buildTool } from './buildTool';
const cheerio = require('cheerio') as typeof import('cheerio');

function cleanText(html: string, maxLength = 4000): string {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, .sidebar, #sidebar, .nav, .menu').remove();
  const body = $('body').text() || $('main').text() || $.text();
  const cleaned = body.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) + '...' : cleaned;
}

export const fetchPageTool = buildTool({
  id: 'fetch_page',
  description: 'Fetch and extract clean text content from a web page URL. Returns the page title and cleaned body text (max 4000 chars).',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri', description: 'The full URL of the page to fetch' },
    },
    required: ['url'],
  },
  execute: async (input: { url: string }) => {
    const { url } = input;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AdFontesManager/1.0 (etymology research tool)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const title = $('title').text().trim() || url;
    const content = cleanText(html);
    return { url, title, content };
  },
});
```

- [ ] **Step 4: Verify tools compile**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | Select-String "buildTool|searchEtymology|fetchPage"
```

Expected: no errors.

---

### Task 6: modelResolver + Stage 配置 + Pipeline Definition

**Files:**
- Create: `src/server/services/ai/modelResolver.ts`
- Create: `src/server/services/ai/agents/research.ts`
- Create: `src/server/services/ai/agents/enrichment.ts`
- Create: `src/server/services/ai/agents/reviewer.ts`
- Create: `src/server/services/ai/definitions/english.ts`

- [ ] **Step 1: Create modelResolver**

Create `src/server/services/ai/modelResolver.ts`:

```typescript
const config = require('../../utils/config') as {
  getAIConfig: () => {
    providers?: Array<{ id: string; baseUrl: string; apiKey: string; formats: string[] }>;
    stages?: Record<string, { provider?: string; model?: string } | undefined>;
  } | undefined;
};

export interface ResolvedModel {
  provider: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  format: 'openai' | 'anthropic';
}

const FALLBACKS: Record<string, ResolvedModel> = {
  fast: { provider: 'openai', modelId: 'gpt-4o-mini', apiKey: '', baseUrl: 'https://api.openai.com/v1', format: 'openai' },
  balanced: { provider: 'openai', modelId: 'gpt-4o', apiKey: '', baseUrl: 'https://api.openai.com/v1', format: 'openai' },
  expert: { provider: 'openai', modelId: 'gpt-4o', apiKey: '', baseUrl: 'https://api.openai.com/v1', format: 'openai' },
};

export function resolveModel(stageName: 'fast' | 'balanced' | 'expert'): ResolvedModel {
  const aiConfig = config.getAIConfig();
  const stageConfig = aiConfig?.stages?.[stageName];

  // Use config if fully specified
  if (stageConfig?.provider && stageConfig?.model) {
    const provider = aiConfig?.providers?.find(p => p.id === stageConfig.provider);
    if (provider) {
      return {
        provider: provider.id,
        modelId: stageConfig.model,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        format: provider.type,
      };
    }
  }

  // Fallback: use env-based defaults if available
  const envKey = process.env[`AI_${stageName.toUpperCase()}_MODEL`];
  const envProvider = process.env[`AI_${stageName.toUpperCase()}_PROVIDER`];
  if (envKey && envProvider) {
    const provider = aiConfig?.providers?.find(p => p.id === envProvider);
    if (provider) {
      return {
        provider: provider.id,
        modelId: envKey,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        format: provider.type,
      };
    }
  }

  return FALLBACKS[stageName];
}
```

- [ ] **Step 2: Create research stage config**

Create `src/server/services/ai/agents/research.ts`:

```typescript
import type { PipelineStage } from '../types';
import { resolveModel } from '../modelResolver';

export const researchStage: PipelineStage = {
  id: 'research',
  description: '搜索词源网站并生成结构字段',
  type: 'llm',
  modelKey: 'fast',
  systemPromptFile: 'english-generation.md',
  toolNames: ['search_etymology', 'fetch_page'],
  outputParser: (text: string) => {
    const yamlMatch = text.match(/```yaml?\n?([\s\S]*?)```/);
    return { researchYaml: yamlMatch ? yamlMatch[1].trim() : text.trim() };
  },
};

export function getResearchModel() {
  return resolveModel('research');
}
```

- [ ] **Step 3: Create enrichment stage config**

Create `src/server/services/ai/agents/enrichment.ts`:

```typescript
import type { PipelineStage } from '../types';
import { resolveModel } from '../modelResolver';

export const enrichmentStage: PipelineStage = {
  id: 'enrichment',
  description: '生成创意 zh 字段',
  type: 'llm',
  modelKey: 'balanced',
  systemPromptFile: 'english-generation.md',
  outputParser: (text: string) => {
    const yamlMatch = text.match(/```yaml?\n?([\s\S]*?)```/);
    return { fullYaml: yamlMatch ? yamlMatch[1].trim() : text.trim() };
  },
};

export function getEnrichmentModel() {
  return resolveModel('enrichment');
}
```

- [ ] **Step 4: Create reviewer stage config**

Create `src/server/services/ai/agents/reviewer.ts`:

```typescript
import type { PipelineStage } from '../types';
import { resolveModel } from '../modelResolver';
import { z } from 'zod';

export const ReviewOutputSchema = z.object({
  field_scores: z.object({
    visual_imagery_zh: z.object({
      score: z.number().min(1).max(10),
      positive: z.array(z.string()),
      negative: z.array(z.string()),
    }),
    meaning_evolution_zh: z.object({
      score: z.number().min(1).max(10),
      positive: z.array(z.string()),
      negative: z.array(z.string()),
    }),
    image_differentiation_zh: z.object({
      score: z.number().min(1).max(10),
      positive: z.array(z.string()),
      negative: z.array(z.string()),
    }),
  }),
  overall_assessment: z.string(),
});

export const reviewerStage: PipelineStage = {
  id: 'review',
  description: 'Reviewer 评分',
  type: 'llm',
  modelKey: 'expert',
  systemPromptFile: 'content-reviewer.md',
  outputParser: (text: string) => {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? { scores: JSON.parse(jsonMatch[0]) } : { scores: { error: 'Failed to parse review JSON' } };
  },
};

export function getReviewerModel() {
  return resolveModel('review');
}
```

- [ ] **Step 5: Create English pipeline definition**

Create `src/server/services/ai/definitions/english.ts`:

```typescript
import type { PipelineDefinition } from '../types';
import { researchStage } from '../agents/research';
import { enrichmentStage } from '../agents/enrichment';
import { reviewerStage } from '../agents/reviewer';

export const englishPipeline: PipelineDefinition = {
  id: 'english-generation',
  language: 'en',
  stages: [researchStage, enrichmentStage, reviewerStage],
};
```

- [ ] **Step 6: Verify compile**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | Select-String "modelResolver|agents|english"
```

Expected: no errors.

---

### Task 7: SequentialRunner (pipe.ts)

**Files:**
- Create: `src/server/services/ai/pipe.ts`

- [ ] **Step 1: Create SequentialRunner**

Create `src/server/services/ai/pipe.ts`. Implements `PipelineRunner` by iterating through stages, calling the Vercel AI SDK `generateText()` for each:

```typescript
import { generateText, type CoreTool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { PipelineRunner, PipelineContext, PipelineProgressEvent } from './types';
import type { ResolvedModel } from './modelResolver';
import { resolveModel } from './modelResolver';
import { searchEtymologyTool } from './tools/searchEtymology';
import { fetchPageTool } from './tools/fetchPage';

const { loadSystemPrompt } = require('./prompts/loader');
const { loggers } = require('../../utils/logger');

// Map tool names to tool implementations
const TOOL_REGISTRY: Record<string, { id: string; description: string; inputSchema: Record<string, unknown>; run: (input: unknown) => Promise<{ success: boolean; data?: unknown; errorCode?: string; errorMessage?: string }> }> = {
  search_etymology: searchEtymologyTool,
  fetch_page: fetchPageTool,
};

function resolveTools(toolNames?: string[]): Record<string, CoreTool> | undefined {
  if (!toolNames || toolNames.length === 0) return undefined;
  const tools: Record<string, CoreTool> = {};
  for (const name of toolNames) {
    const tool = TOOL_REGISTRY[name];
    if (tool) {
      tools[name] = {
        description: tool.description,
        parameters: tool.inputSchema,
        execute: tool.run,
      } as CoreTool;
    }
  }
  return Object.keys(tools).length > 0 ? tools : undefined;
}

function createProvider(model: ResolvedModel) {
  if (model.format === 'openai') {
    const openai = createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl });
    return openai(model.modelId);
  }
  // Future: Anthropic format — add createAnthropic() when needed
  throw new Error(`Unsupported model format: ${model.format}`);
}

function buildPrompt(stageId: string, ctx: PipelineContext): string {
  const vars: Record<string, string> = {
    word: ctx.word,
    context: ctx.context || '',
    language: ctx.language,
    notes: ctx.notes || '',
  };

  if (stageId === 'enrichment') {
    vars.promptType = 'enrichment';
  } else if (stageId === 'review') {
    vars.yaml = ctx.fullYaml || '';
    return loadSystemPrompt('content-reviewer.md', vars);
  }

  const base = loadSystemPrompt('english-generation.md', vars);

  if (stageId === 'research') {
    return base;
  }

  // Enrichment prompt includes research output
  return [
    base,
    '',
    '## Research Output',
    ctx.researchYaml || '',
    '',
    '## Search Summary',
    ctx.searchSummary || '',
    '',
    'Now generate the FULL YAML including all zh creative fields.',
  ].join('\n');
}

export class SequentialRunner implements PipelineRunner {
  async run({ definition, input, onProgress }) {
    const startTime = Date.now();
    const runLogger = loggers.ai.child({ word: input.word, language: input.language });
    runLogger.info({ event: 'pipeline:start', pipeline: definition.id });

    // Initialize context — typed, no as<any>
    const ctx: PipelineContext = {
      word: input.word,
      context: input.context || '',
      language: input.language,
      notes: input.notes || '',
    };

    try {
      for (const stage of definition.stages) {
        const model = resolveModel(stage.modelKey);
        const systemPrompt = buildPrompt(stage.id, ctx);
        const tools = resolveTools(stage.toolNames);

        // Emit step:start
        onProgress({ type: 'step:start', step: stage.id, message: stage.description });
        const stepStart = Date.now();
        runLogger.info({ step: stage.id, event: 'start', model: `${model.provider}/${model.modelId}` });

        try {
          const result = await generateText({
            model: createProvider(model),
            system: systemPrompt,
            tools,
            maxTokens: 4096,
          });

          const text = result.text || '';
          const parsed = stage.outputParser ? stage.outputParser(text) : { raw: text };

          // Merge parsed output into context
          Object.assign(ctx, parsed);

          const duration = Date.now() - stepStart;
          onProgress({
            type: 'step:complete',
            step: stage.id,
            duration,
            summary: `${stage.description} 完成`,
            result: parsed,
          });
          runLogger.info({ step: stage.id, event: 'complete', durationMs: duration });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onProgress({ type: 'step:error', step: stage.id, error: msg, willRetry: false });
          runLogger.error({ step: stage.id, event: 'error', error: msg });
          // Non-fatal: return partial result
          return { yaml: ctx.fullYaml || ctx.researchYaml || '', scores: { error: `${stage.id}_failed` } };
        }
      }

      const totalDuration = Date.now() - startTime;
      const yaml = ctx.fullYaml || '';
      const scores = ctx.scores || {};
      onProgress({ type: 'pipeline:complete', yaml, scores, totalDuration });
      runLogger.info({ event: 'pipeline:complete', totalDurationMs: totalDuration });

      return { yaml, scores };
    } finally {
      runLogger.info({ event: 'pipeline:finished' });
    }
  }
}

export const sequentialRunner = new SequentialRunner();
```

- [ ] **Step 2: Verify pipe.ts compiles**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | Select-String "pipe\.ts"
```

Expected: no errors.

---

### Task 8: 路由 + Controller + SSE

**Files:**
- Create: `src/server/controllers/generateController.ts`
- Create: `src/server/services/ai/routes/generate.ts`
- Modify: `src/server/app.ts`

- [ ] **Step 1: Create generate controller**

Create `src/server/controllers/generateController.ts`:

```typescript
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PipelineJob, PipelineProgressEvent } from '../services/ai/types';
import { sequentialRunner } from '../services/ai/pipe';
import { englishPipeline } from '../services/ai/definitions/english';
import { loggers } from '../utils/logger';

const GenerateRequestSchema = z.object({
  word: z.string().min(1),
  context: z.string().optional(),
  language: z.enum(['en', 'de']),
  notes: z.string().optional(),
});

const jobs = new Map<string, PipelineJob>();
const sseClients = new Map<string, Set<Response>>();

function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function selectPipeline(language: string) {
  // Future: return germanPipeline when defined
  return englishPipeline;
}

export async function handleGenerateSingle(req: Request, res: Response): Promise<void> {
  const parsed = GenerateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 400, message: 'Invalid request', errors: parsed.error.issues });
    return;
  }

  const { word, context, language, notes } = parsed.data;
  const jobId = generateJobId();
  const runLogger = loggers.ai.child({ jobId, word, language });

  const job: PipelineJob = {
    jobId, word, language, context, notes,
    status: 'running',
    steps: [],
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);
  runLogger.info({ event: 'pipeline:start' });

  const definition = selectPipeline(language);

  sequentialRunner
    .run({
      definition,
      input: { word, context, language, notes },
      onProgress: (event: PipelineProgressEvent) => {
        if (event.type === 'step:start') {
          job.steps.push({ step: event.step, status: 'running', startTime: Date.now() });
          job.currentStep = event.step;
        } else if (event.type === 'step:complete') {
          const step = job.steps.find(s => s.step === event.step && s.status === 'running');
          if (step) { step.status = 'complete'; step.endTime = Date.now(); step.durationMs = event.duration; step.summary = event.summary; step.result = event.result; }
        } else if (event.type === 'step:error') {
          const step = job.steps.find(s => s.step === event.step && s.status === 'running');
          if (step) { step.status = 'error'; step.error = event.error; }
        } else if (event.type === 'pipeline:complete') {
          job.status = 'complete'; job.completedAt = Date.now();
          job.result = { yaml: event.yaml, scores: event.scores };
        }

        const clients = sseClients.get(jobId);
        if (clients) { for (const client of clients) { sendSSE(client, event.type, event); } }
      },
    })
    .catch((err) => {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      const clients = sseClients.get(jobId);
      if (clients) {
        for (const client of clients) {
          sendSSE(client, 'step:error', { step: 'pipeline', error: job.error, willRetry: false });
        }
      }
    });

  res.status(202).json({ jobId });
}

export async function handleStream(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) { res.status(404).json({ code: 404, message: 'Job not found' }); return; }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (!sseClients.has(jobId)) { sseClients.set(jobId, new Set()); }
  sseClients.get(jobId)!.add(res);

  // Replay existing steps
  for (const step of job.steps) {
    if (step.status === 'complete') {
      sendSSE(res, 'step:complete', { step: step.step, duration: step.durationMs || 0, summary: step.summary || '', result: step.result });
    } else if (step.status === 'error') {
      sendSSE(res, 'step:error', { step: step.step, error: step.error || 'Unknown error', willRetry: false });
    }
  }
  if (job.status === 'complete' && job.result) {
    sendSSE(res, 'pipeline:complete', { yaml: job.result.yaml, scores: job.result.scores, totalDuration: job.completedAt ? job.completedAt - job.startedAt : 0 });
  }

  // Keepalive (15s) — from claude-code sse-writer.ts
  const keepaliveTimer = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepaliveTimer); }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepaliveTimer);
    const clients = sseClients.get(jobId);
    if (clients) { clients.delete(res); if (clients.size === 0) { sseClients.delete(jobId); } }
  });
  req.on('aborted', () => { clearInterval(keepaliveTimer); });
}
```

- [ ] **Step 2: Create generate routes**

Create `src/server/services/ai/routes/generate.ts`:

```typescript
const { Router } = require('express');
const { handleGenerateSingle, handleStream } = require('../../controllers/generateController');
const writeAuth = require('../../middleware/writeAuth');

const router = Router();
router.post('/generate/single', writeAuth, handleGenerateSingle);
router.get('/generate/:jobId/stream', handleStream);

module.exports = router;
```

- [ ] **Step 3: Register routes in app.ts**

Modify `src/server/app.ts` — add after the existing `/api/v2/words` route:

```typescript
  app.use('/api/v2', require('./services/ai/routes/generate'));
```

- [ ] **Step 4: Verify compile**

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1 | Select-String "generateController|generate\.ts"
```

Expected: no errors.

---

### Task 9: useAiGenerate() Composable

**Files:**
- Create: `src/renderer/src/composables/useAiGenerate.ts`

- [ ] **Step 1: Create composable**

Create `src/renderer/src/composables/useAiGenerate.ts`:

```typescript
import { ref, computed, onUnmounted } from 'vue';
import request from '@/utils/request';

export interface StepState {
  step: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  message?: string;
  duration?: number;
  summary?: string;
  result?: unknown;
  error?: string;
}

export interface JobState {
  jobId: string;
  word: string;
  language: string;
  context?: string;
  status: 'queued' | 'running' | 'complete' | 'error';
  steps: StepState[];
  currentStep?: string;
  error?: string;
  yaml?: string;
  scores?: Record<string, unknown>;
}

export interface GenerateParams {
  word: string;
  context?: string;
  language: 'en' | 'de';
  notes?: string;
}

export function useAiGenerate() {
  const jobs = ref<Map<string, JobState>>(new Map());
  const selectedJobId = ref<string | null>(null);
  const eventSources = new Map<string, EventSource>();

  const currentJob = computed(() => {
    if (!selectedJobId.value) return null;
    return jobs.value.get(selectedJobId.value) || null;
  });

  const isRunning = computed(() => currentJob.value?.status === 'running' || currentJob.value?.status === 'queued');
  const isComplete = computed(() => currentJob.value?.status === 'complete');

  function registerJob(jobId: string, word: string, language: string, context?: string) {
    jobs.value.set(jobId, { jobId, word, language, context, status: 'running', steps: [] });
    if (!selectedJobId.value) { selectedJobId.value = jobId; }
  }

  async function startGeneration(params: GenerateParams): Promise<string> {
    const response = await request.post<{ jobId: string }>('/v2/generate/single', params);
    const { jobId } = response;
    registerJob(jobId, params.word, params.language, params.context);
    subscribeToJob(jobId);
    return jobId;
  }

  function subscribeToJob(jobId: string) {
    const base = (request as any).getBaseUrl?.() || '';
    const url = `${base}/api/v2/generate/${jobId}/stream`;
    const es = new EventSource(url);
    eventSources.set(jobId, es);

    es.addEventListener('step:start', (e) => {
      const data = JSON.parse(e.data);
      const job = jobs.value.get(jobId);
      if (job) {
        job.steps.push({ step: data.step, status: 'running', message: data.message });
        job.currentStep = data.step;
      }
    });

    es.addEventListener('step:tokens', (_e) => {
      // Reserved for future UI toggle
    });

    es.addEventListener('step:complete', (e) => {
      const data = JSON.parse(e.data);
      const job = jobs.value.get(jobId);
      if (job) {
        const step = job.steps.find(s => s.step === data.step && s.status === 'running');
        if (step) { step.status = 'complete'; step.duration = data.duration; step.summary = data.summary; step.result = data.result; }
      }
    });

    es.addEventListener('step:error', (e) => {
      const data = JSON.parse(e.data);
      const job = jobs.value.get(jobId);
      if (job) {
        const step = job.steps.find(s => s.step === data.step && s.status === 'running');
        if (step) { step.status = 'error'; step.error = data.error; }
      }
    });

    es.addEventListener('pipeline:complete', (e) => {
      const data = JSON.parse(e.data);
      const job = jobs.value.get(jobId);
      if (job) { job.status = 'complete'; job.yaml = data.yaml; job.scores = data.scores; }
      es.close();
      eventSources.delete(jobId);
    });

    es.onerror = () => {
      if (jobs.value.get(jobId)?.status === 'complete') { es.close(); eventSources.delete(jobId); }
    };
  }

  function unsubscribeJob(jobId: string) {
    eventSources.get(jobId)?.close();
    eventSources.delete(jobId);
  }

  function selectJob(jobId: string | null) { selectedJobId.value = jobId; }

  onUnmounted(() => {
    for (const es of eventSources.values()) { es.close(); }
    eventSources.clear();
  });

  return { jobs, currentJob, selectedJobId, isRunning, isComplete, startGeneration, subscribeToJob, unsubscribeJob, selectJob };
}
```

- [ ] **Step 2: Verify composable compiles**

```bash
npx vue-tsc --noEmit 2>&1 | Select-String "useAiGenerate"
```

Expected: no errors.

---

### Task 10: AiGenerateBar.vue 组件

**Files:**
- Create: `src/renderer/src/components/AiGenerate/AiGenerateBar.vue`
- Modify: `src/renderer/src/components/WordEditor/WordEditor.vue`

- [ ] **Step 1: Create AiGenerateBar component**

Create `src/renderer/src/components/AiGenerate/AiGenerateBar.vue` — a collapsible AI panel with 4 states (idle / running-collapsed / running-expanded / complete-expanded). Pure rendering — no business logic. See design doc section 8 for state details. The component uses `useAiGenerate()` for all state.

Component structure:
- Props: `onYamlReady: (yaml: string) => void`
- Local refs: `expanded`, `word`, `context`, `language`, `notes`, `errorMessage`
- Computed: `currentStageLabel`, `progressPercent` (from `currentJob.steps`)
- Actions: `handleStart()` → `startGeneration()`, `handleAcceptYaml()` → `emit('yaml-ready')`, `handleRegenerate()` → re-runs with user notes
- Template: collapsible bar layout matching the 4-state design from the visual companion mockup

(Full component code omitted from plan for brevity — refer to the visual companion mockup in `.superpowers/brainstorm/` and the design doc.)

- [ ] **Step 2: Embed AiGenerateBar in WordEditor**

Modify `src/renderer/src/components/WordEditor/WordEditor.vue`:

Add import:
```typescript
import AiGenerateBar from '@/components/AiGenerate/AiGenerateBar.vue';
```

Add inside `<div class="panel editor-panel">` at the top:
```html
    <AiGenerateBar @yaml-ready="(yaml: string) => { input = yaml; handleInput(); }" />
```

- [ ] **Step 3: Verify frontend compiles**

```bash
npx vue-tsc --noEmit 2>&1 | Select-String "AiGenerateBar"
```

Expected: no errors.

---

### Task 11: 安装依赖 + E2E 验证

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install ai @ai-sdk/openai cheerio
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('ai'); console.log('ai OK')"
node -e "require('cheerio'); console.log('cheerio OK')"
```

Expected: both print "OK".

- [ ] **Step 3: Full type check**

```bash
npm run type-check
```

Expected: no new type errors in AI service files.

- [ ] **Step 4: Start server and test config API**

```bash
# Terminal 1
npm run dev:server

# Terminal 2
curl -X PUT http://localhost:8080/api/v2/config/ai \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: dev-token-not-for-production" \
  -d '{"providers":[{"id":"openai","name":"OpenAI","baseUrl":"https://api.openai.com/v1","apiKey":"sk-test","formats":["openai"],"models":[{"id":"gpt-4o-mini","name":"GPT-4o Mini","formats":["openai"]}]}],"search":{"provider":"brave","apiKey":"BSA-test","domains":{"common":["en.wiktionary.org"]}},"stages":{"research":{"provider":"openai","model":"gpt-4o-mini"},"enrichment":{"provider":"openai","model":"gpt-4o-mini"},"review":{"provider":"openai","model":"gpt-4o-mini"}},"review":{"threshold":6}}'
```

Expected: 200-level response.

- [ ] **Step 5: Test single word generation**

```bash
curl -X POST http://localhost:8080/api/v2/generate/single \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: dev-token-not-for-production" \
  -d '{"word":"apple","language":"en"}'
```

Expected: `{"jobId": "job-..."}` (202).

- [ ] **Step 6: Test SSE stream**

```bash
curl -N http://localhost:8080/api/v2/generate/<jobId>/stream
```

Expected: SSE events — `step:start`, `step:complete`, `pipeline:complete`.

- [ ] **Step 7: Frontend e2e**

1. Open dev URL
2. Type "apple" in AI Generate input
3. Click "生成" → observe pipeline steps
4. See review scores → click "填入编辑器" → YAML appears in editor

---

### Task 12: 清理和收尾

- [ ] **Step 1: Lint fix**

```bash
npm run lint:fix
```

- [ ] **Step 2: Final lint check**

```bash
npm run lint
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(ai): minimal single-word generation pipeline

- SequentialRunner with PipelineDefinition/PipelineRunner abstraction
- 3-stage pipeline: research -> enrichment -> review
- modelResolver for centralized model config
- buildTool() wrapper: timeout, retry, structured errors, logging
- Brave Search API tool + cheerio page fetch tool
- SSE progress streaming with keepalive + replay
- AiGenerateBar Vue component (4-state collapsible)
- useAiGenerate() composable (batch-aware interface)
- Zod AI config schema aligned with Phase 2 plan
- Pino AI module logger"
```
