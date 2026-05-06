# AI Settings 配置页面 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Settings 页面实现完整的 AI 配置管理，包含 Provider CRUD、Stage 模型分配、Search API 配置、Review 阈值，并补齐 config.json 读写能力。

**Architecture:** 9 个 task，自底向上：Schema → Config 系统升级 → Service → Routes → 注册 → 前端 API → UI → 测试验证。纯函数优先测试，UI 手动验证。

**Tech Stack:** Zod (schema), fs (config.json 读写), Express 5 (routes), Vue 3 + Pinia (UI), Vitest (unit test), pino (logging)

---

## 文件结构总览

```
新增:
  src/server/schemas/aiConfig.ts              # AI 配置 Zod schemas
  src/server/services/ai/configService.ts      # 脱敏、合并、校验
  src/server/services/ai/configService.test.ts # maskApiKey + mergeWithMaskedCheck 单元测试
  src/server/routes/aiConfig.ts               # GET/PUT /api/v2/config/ai + POST test-provider
  src/renderer/src/services/aiConfigApi.ts     # 前端 API 封装

修改:
  src/server/schemas/config.ts                # 添加 ai 字段到 ConfigSchema
  src/server/utils/config.ts                  # config.json 读写 + 备份 + 原子写 + AI env
  src/server/utils/logger.ts                  # 添加 loggers.ai
  src/server/app.ts                           # 注册 /api/v2/config/ai 路由
  src/renderer/src/views/SettingsView.vue      # 新增 AI 配置 section (4个子区块)
```

---

### Task 1: AI Config Zod Schema

**Files:**
- Create: `src/server/schemas/aiConfig.ts`
- Modify: `src/server/schemas/config.ts` (添加 `ai` 字段)

- [ ] **Step 1: 创建 AI Config Schema 文件**

```typescript
// src/server/schemas/aiConfig.ts
const { z } = require('zod') as typeof import('zod');

const AIProviderSchema = z.object({
  id: z
    .string()
    .min(1, 'Provider ID is required')
    .regex(/^[a-z0-9_-]+$/, 'Provider ID must be lowercase alphanumeric (a-z, 0-9, _, -)'),
  name: z.string().min(1, 'Provider name is required'),
  type: z.enum(['openai', 'anthropic']).default('openai'),
  baseUrl: z.string().url('Must be a valid URL'),
  apiKey: z.string().min(1, 'API Key is required'),
  models: z
    .array(
      z.object({
        id: z.string().min(1, 'Model ID is required'),
        name: z.string().min(1, 'Model name is required'),
      })
    )
    .min(1, 'At least one model is required'),
});

const AISearchConfigSchema = z.object({
  provider: z.enum(['brave', 'tavily']).default('brave'),
  apiKey: z.string().min(1, 'Search API Key is required'),
  autoDomains: z.boolean().default(false),
  domains: z
    .object({
      common: z.array(z.string()).default([]),
      en: z.array(z.string()).default([]),
      de: z.array(z.string()).default([]),
    })
    .default({}),
});

const AIStageConfigSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  model: z.string().min(1, 'Model is required'),
});

const AIConfigSchema = z.object({
  providers: z.array(AIProviderSchema).default([]),
  search: AISearchConfigSchema.optional(),
  stages: z
    .object({
      research: AIStageConfigSchema.optional(),
      enrichment: AIStageConfigSchema.optional(),
      review: AIStageConfigSchema.optional(),
    })
    .default({}),
  review: z
    .object({
      threshold: z.number().int().min(1).max(10).default(6),
      thresholdByLanguage: z.record(z.number().int().min(1).max(10)).default({}),
    })
    .default({}),
});

// 用于 PUT 请求的 partial schema——所有字段可选，支持增量更新
const AIConfigUpdateSchema = z.object({
  providers: z.array(AIProviderSchema).optional(),
  search: AISearchConfigSchema.optional(),
  stages: z
    .object({
      research: AIStageConfigSchema.optional(),
      enrichment: AIStageConfigSchema.optional(),
      review: AIStageConfigSchema.optional(),
    })
    .optional(),
  review: z
    .object({
      threshold: z.number().int().min(1).max(10).optional(),
      thresholdByLanguage: z.record(z.number().int().min(1).max(10)).optional(),
    })
    .optional(),
});

// Provider 连通测试输入
const TestProviderInputSchema = z.object({
  baseUrl: z.string().url('Must be a valid URL'),
  apiKey: z.string().min(1, 'API Key is required'),
  type: z.enum(['openai', 'anthropic']),
});

module.exports = {
  AIConfigSchema,
  AIConfigUpdateSchema,
  AIProviderSchema,
  AISearchConfigSchema,
  AIStageConfigSchema,
  TestProviderInputSchema,
};
```

- [ ] **Step 2: 扩展顶层 ConfigSchema**

在 `src/server/schemas/config.ts` 顶部添加 import，在 `.object({...})` 中添加 `ai` 字段。

修改前 `src/server/schemas/config.ts:38-87` — 在 `const ConfigSchema = z.object({` 的开头添加 import，在 `security` 字段后添加 `ai`:

```typescript
// 文件顶部添加 (第 1 行之后):
const { AIConfigSchema } = require('./aiConfig') as {
  AIConfigSchema: import('zod').ZodObject<any>;
};

// ConfigSchema 的 .object({...}) 中，在 security 字段定义后添加:
    security: z.object({
      helmet: z.boolean(),
      hsts: z.boolean(),
    }),
    ai: AIConfigSchema.optional(),
  })
```

具体编辑: 在 `src/server/schemas/config.ts` 第 2 行（`const net = require('net')` 之后）插入 import。在第 86 行 `.superRefine` 之前插入 `ai: AIConfigSchema.optional(),`。

- [ ] **Step 3: 验证 Schema 可被 require**

```bash
node -e "const s = require('./src/server/schemas/aiConfig'); console.log('AIConfigSchema:', !!s.AIConfigSchema); console.log('TestProviderInputSchema:', !!s.TestProviderInputSchema)"
```

Expected: `AIConfigSchema: true` / `TestProviderInputSchema: true`

- [ ] **Step 4: 运行 type-check**

```bash
npm run type-check
```

Expected: 无新增 type 错误（aiConfig 是新增文件，不会有已有类型冲突）。

- [ ] **Step 5: Commit**

```bash
git add src/server/schemas/aiConfig.ts src/server/schemas/config.ts
git commit -m "feat(ai): add AI config Zod schemas"
```

---

### Task 2: Config 系统升级（config.json 读写）

**Files:**
- Modify: `src/server/utils/config.ts` (约 50 行新增)

- [ ] **Step 1: 添加 config.json 文件操作函数**

在 `src/server/utils/config.ts` 中，在 `const envMapping` 之前（第 99 行附近）插入以下代码:

```typescript
// --- config.json file I/O ---

function resolveConfigPath(): string {
  if (process.env.ADFONTES_CONFIG_PATH) return process.env.ADFONTES_CONFIG_PATH;
  return path.join(process.cwd(), 'config.json');
}

function loadConfigFile(): ConfigObject {
  const configPath = resolveConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ConfigObject;
      }
      console.warn(`config.json at ${configPath} is not a valid object, ignoring`);
    }
  } catch (err) {
    console.warn(`Failed to read ${configPath}, using defaults`, err);
  }
  return {};
}

function backupConfigFile(configPath: string): void {
  if (!fs.existsSync(configPath)) return;
  const bakPath = configPath + '.bak';
  try {
    fs.copyFileSync(configPath, bakPath);
  } catch {
    // backup failure is non-fatal
  }
}

function saveConfigFile(config: ConfigObject): void {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = configPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  backupConfigFile(configPath);
  fs.renameSync(tmpPath, configPath);
  clearCache();
}
```

- [ ] **Step 2: 修改 loadConfig() 加载流程**

将 `src/server/utils/config.ts:228-232` 的 `loadConfig` 函数替换为:

```typescript
function loadConfig(): ConfigObject {
  if (configCache) return configCache;
  const fileConfig = loadConfigFile();
  const envConfig = loadFromEnv();
  // 加载顺序: defaults → file → env (env 优先级最高)
  configCache = validateConfig(deepMerge(defaultConfig, deepMerge(fileConfig, envConfig)));
  return configCache;
}
```

- [ ] **Step 3: 添加 AI 默认值和 env 映射**

在 `defaultConfig` 对象中（第 97 行 `}` 之前）添加 `ai` 默认值:

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

在 `envMapping` 对象中（第 121 行 `}` 之前）添加:

```typescript
  AI_SEARCH_API_KEY: 'ai.search.apiKey',
  AI_SEARCH_PROVIDER: 'ai.search.provider',
  AI_REVIEW_THRESHOLD: 'ai.review.threshold',
  AI_RESEARCH_PROVIDER: 'ai.stages.research.provider',
  AI_RESEARCH_MODEL: 'ai.stages.research.model',
  AI_ENRICHMENT_PROVIDER: 'ai.stages.enrichment.provider',
  AI_ENRICHMENT_MODEL: 'ai.stages.enrichment.model',
  AI_REVIEW_PROVIDER: 'ai.stages.review.provider',
  AI_REVIEW_MODEL: 'ai.stages.review.model',
```

- [ ] **Step 4: 导出 saveConfigFile 和 resolveConfigPath**

在 `module.exports` 块中添加:

```typescript
module.exports = {
  get,
  getAll,
  reload,
  clearCache,
  defaultConfig,
  saveConfigFile,
  resolveConfigPath,
};
```

- [ ] **Step 5: 验证 config.json 读写**

```bash
node -e "
const config = require('./src/server/utils/config');
config.saveConfigFile({ test: { value: 42 } });
const fs = require('fs');
const raw = fs.readFileSync('config.json', 'utf-8');
console.log('config.json exists:', fs.existsSync('config.json'));
console.log('content:', raw);
// cleanup
fs.unlinkSync('config.json');
"
```

Expected: `config.json exists: true` 且内容包含 `"value": 42`

- [ ] **Step 6: 验证 backup 机制**

```bash
node -e "
const config = require('./src/server/utils/config');
config.saveConfigFile({ a: 1 });
config.saveConfigFile({ b: 2 });
const fs = require('fs');
console.log('.bak exists:', fs.existsSync('config.json.bak'));
console.log('.bak content has a:1:', fs.readFileSync('config.json.bak', 'utf-8').includes('\"a\": 1'));
// cleanup
fs.unlinkSync('config.json');
fs.unlinkSync('config.json.bak');
config.clearCache();
"
```

Expected: 两次都为 `true`

- [ ] **Step 7: 运行 lint**

```bash
npm run lint
```

Expected: 无错误（修复后重试）

- [ ] **Step 8: Commit**

```bash
git add src/server/utils/config.ts
git commit -m "feat(config): add config.json file I/O with backup and atomic write"
```

---

### Task 3: AI Logger

**Files:**
- Modify: `src/server/utils/logger.ts:139-147`

- [ ] **Step 1: 添加 loggers.ai**

在 `src/server/utils/logger.ts` 的 `loggers` 对象（第 139-147 行）中添加:

```typescript
const loggers = {
  word: createModuleLogger('word'),
  sync: createModuleLogger('sync'),
  db: createModuleLogger('db'),
  api: createModuleLogger('api'),
  anki: createModuleLogger('anki'),
  auth: createModuleLogger('auth'),
  system: createModuleLogger('system'),
  ai: createModuleLogger('ai'),   // ← 新增
};
```

- [ ] **Step 2: 验证 logger 可用**

```bash
node -e "
const { loggers } = require('./src/server/utils/logger');
loggers.ai.info({ test: true }, 'ai logger works');
console.log('ai logger created:', !!loggers.ai);
"
```

Expected: `ai logger created: true`

- [ ] **Step 3: Commit**

```bash
git add src/server/utils/logger.ts
git commit -m "feat(logger): add ai module logger"
```

---

### Task 4: AI Config Service + 单元测试

**Files:**
- Create: `src/server/services/ai/configService.ts`
- Create: `src/server/services/ai/configService.test.ts`

- [ ] **Step 1: 编写失败测试 — maskApiKey**

```typescript
// src/server/services/ai/configService.test.ts
import { describe, expect, it } from 'vitest';

// 先用动态 import 让测试失败（文件不存在）
describe('configService', () => {
  it('masks a standard OpenAI API key', () => {
    const { maskApiKey } = require('./configService');
    const result = maskApiKey('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    expect(result).toBe('sk-***3456');
    expect(result).not.toContain('abcdefghij');
  });

  it('masks a short key', () => {
    const { maskApiKey } = require('./configService');
    const result = maskApiKey('abc12345');
    expect(result).toBe('***');
  });

  it('masks a Brave API key', () => {
    const { maskApiKey } = require('./configService');
    const result = maskApiKey('BSA-abcdefghijklmnop');
    expect(result).toBe('BSA***mnop');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/server/services/ai/configService.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现 configService.ts**

```typescript
// src/server/services/ai/configService.ts
const config = require('../../utils/config') as {
  get: <T = unknown>(path: string, defaultValue?: T) => T;
  getAll: () => Record<string, unknown>;
  saveConfigFile: (config: Record<string, unknown>) => void;
};
const { loggers } = require('../../utils/logger') as {
  loggers: { ai: { info: (p: Record<string, unknown>, m?: string) => void; error: (p: Record<string, unknown>, m?: string) => void } };
};
const { AIConfigSchema, AIConfigUpdateSchema } = require('../../schemas/aiConfig') as {
  AIConfigSchema: { parse: (v: unknown) => AIConfig };
  AIConfigUpdateSchema: { parse: (v: unknown) => AIConfigUpdate };
};

// ---- types ----

interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  models: { id: string; name: string }[];
}

interface AISearchConfig {
  provider: 'brave' | 'tavily';
  apiKey: string;
  autoDomains: boolean;
  domains: { common: string[]; en: string[]; de: string[] };
}

interface AIStageConfig {
  provider: string;
  model: string;
}

interface AIConfig {
  providers: AIProvider[];
  search?: AISearchConfig;
  stages: {
    research?: AIStageConfig;
    enrichment?: AIStageConfig;
    review?: AIStageConfig;
  };
  review: {
    threshold: number;
    thresholdByLanguage: Record<string, number>;
  };
}

type AIConfigUpdate = Partial<AIConfig>;

// 脱敏后的类型——apiKey 字段始终是 masked string
type AIConfigMasked = AIConfig;

// ---- key masking ----

function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}***${suffix}`;
}

function maskProvider(provider: AIProvider): AIProvider {
  return { ...provider, apiKey: maskApiKey(provider.apiKey) };
}

function maskSearch(search: AISearchConfig): AISearchConfig {
  return { ...search, apiKey: maskApiKey(search.apiKey) };
}

// ---- config accessors ----

function getAIConfig(): AIConfig {
  const ai = config.get<AIConfig | undefined>('ai');
  if (!ai) {
    return {
      providers: [],
      stages: {},
      review: { threshold: 6, thresholdByLanguage: {} },
    };
  }
  return ai;
}

function getAIConfigMasked(): AIConfigMasked {
  const ai = getAIConfig();
  return {
    ...ai,
    providers: ai.providers.map(maskProvider),
    search: ai.search ? maskSearch(ai.search) : undefined,
  };
}

// ---- config update ----

function containsMask(maskedValue: string): boolean {
  return maskedValue.includes('***');
}

function mergeProviderWithMaskedCheck(
  inputProvider: AIProvider,
  existingProvider?: AIProvider
): AIProvider {
  if (!existingProvider) return inputProvider;
  if (containsMask(inputProvider.apiKey)) {
    return { ...inputProvider, apiKey: existingProvider.apiKey };
  }
  return inputProvider;
}

function mergeSearchWithMaskedCheck(
  inputSearch: AISearchConfig,
  existingSearch?: AISearchConfig
): AISearchConfig {
  if (!existingSearch) return inputSearch;
  if (containsMask(inputSearch.apiKey)) {
    return { ...inputSearch, apiKey: existingSearch.apiKey };
  }
  return inputSearch;
}

function updateAIConfig(input: unknown): AIConfigMasked {
  const validated = AIConfigUpdateSchema.parse(input) as AIConfigUpdate;
  const existing = getAIConfig();

  // 构建新的完整配置
  const merged: AIConfig = {
    providers: validated.proiders
      ? validated.providers.map((p, i) =>
          mergeProviderWithMaskedCheck(p, existing.providers[i])
        )
      : existing.providers,
    search: validated.search
      ? mergeSearchWithMaskedCheck(validated.search, existing.search)
      : existing.search,
    stages: validated.stages
      ? { ...existing.stages, ...validated.stages }
      : existing.stages,
    review: validated.review
      ? { ...existing.review, ...validated.review }
      : existing.review,
  };

  // 完整校验
  const fullValidated = AIConfigSchema.parse(merged);

  // 获取完整 config，合并 ai 字段，写回
  const fullConfig = config.getAll() as Record<string, unknown>;
  fullConfig.ai = fullValidated as unknown as Record<string, unknown>;
  config.saveConfigFile(fullConfig);

  loggers.ai.info(
    {
      providerCount: fullValidated.providers.length,
      hasSearch: !!fullValidated.search,
    },
    'AI config saved'
  );

  return getAIConfigMasked();
}

module.exports = {
  maskApiKey,
  getAIConfig,
  getAIConfigMasked,
  updateAIConfig,
  mergeProviderWithMaskedCheck,
  mergeSearchWithMaskedCheck,
};
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/server/services/ai/configService.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: 补充 mergeWithMaskedCheck 测试**

在 test 文件中补充以下测试:

```typescript
  it('mergeProviderWithMaskedCheck reuses existing key when input is masked', () => {
    const { mergeProviderWithMaskedCheck } = require('./configService');
    const existing = {
      id: 'openai', name: 'OpenAI', type: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-real-key-12345', models: [],
    };
    const input = { ...existing, apiKey: 'sk-***2345' };
    const result = mergeProviderWithMaskedCheck(input, existing);
    expect(result.apiKey).toBe('sk-real-key-12345');
  });

  it('mergeProviderWithMaskedCheck uses new key when input is unmasked', () => {
    const { mergeProviderWithMaskedCheck } = require('./configService');
    const existing = {
      id: 'openai', name: 'OpenAI', type: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-old-key', models: [],
    };
    const input = { ...existing, apiKey: 'sk-new-key-67890' };
    const result = mergeProviderWithMaskedCheck(input, existing);
    expect(result.apiKey).toBe('sk-new-key-67890');
  });

  it('mergeProviderWithMaskedCheck returns input as-is when no existing', () => {
    const { mergeProviderWithMaskedCheck } = require('./configService');
    const input = {
      id: 'openai', name: 'OpenAI', type: 'openai' as const,
      baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-new-key', models: [],
    };
    const result = mergeProviderWithMaskedCheck(input, undefined);
    expect(result.apiKey).toBe('sk-new-key');
  });
```

运行 `npx vitest run src/server/services/ai/configService.test.ts` — expected 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ai/configService.ts src/server/services/ai/configService.test.ts
git commit -m "feat(ai): add AI config service with key masking and merge logic"
```

---

### Task 5: API Routes (GET/PUT config + POST test-provider)

**Files:**
- Create: `src/server/routes/aiConfig.ts`

- [ ] **Step 1: 创建路由文件**

```typescript
// src/server/routes/aiConfig.ts
const express = require('express') as typeof import('express');
const router = express.Router();

const { asyncHandler, BadRequest, ServiceUnavailable } = require('../utils/errors') as {
  asyncHandler: <T extends (req: any, res: any) => Promise<any>>(fn: T) => T;
  BadRequest: (message: string, data?: unknown) => Error;
  ServiceUnavailable: (message: string, data?: unknown) => Error;
};
const { requireWriteAccess } = require('../middleware/writeAuth') as {
  requireWriteAccess: (req: any, res: any, next: any) => void;
};
const { validateBody } = require('../middleware/validate') as {
  validateBody: (schema: unknown) => (req: any, res: any, next: any) => void;
};
const { TestProviderInputSchema } = require('../schemas/aiConfig') as {
  TestProviderInputSchema: { parse: (v: unknown) => { baseUrl: string; apiKey: string; type: string } };
};
const { getAIConfigMasked, updateAIConfig } = require('../services/ai/configService') as {
  getAIConfigMasked: () => any;
  updateAIConfig: (input: unknown) => any;
};
const { loggers } = require('../utils/logger') as {
  loggers: { ai: { info: (p: Record<string, unknown>, m?: string) => void; error: (p: Record<string, unknown>, m?: string) => void } };
};

// GET /api/v2/config/ai — 返回脱敏配置
router.get(
  '/config/ai',
  asyncHandler(async (_req: any, res: any) => {
    const masked = getAIConfigMasked();
    res.json(masked);
  })
);

// PUT /api/v2/config/ai — 保存配置
router.put(
  '/config/ai',
  requireWriteAccess,
  asyncHandler(async (req: any, res: any) => {
    try {
      const masked = updateAIConfig(req.body);
      res.json(masked);
    } catch (err: any) {
      if (err.name === 'ZodError') {
        throw BadRequest('AI config validation failed', {
          code: 'VALIDATION_ERROR',
          issues: err.issues,
        });
      }
      throw err;
    }
  })
);

// POST /api/v2/config/ai/test-provider — 测试连通性
router.post(
  '/config/ai/test-provider',
  requireWriteAccess,
  validateBody(TestProviderInputSchema),
  asyncHandler(async (req: any, res: any) => {
    const { baseUrl, apiKey, type } = req.body as { baseUrl: string; apiKey: string; type: string };

    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const modelsUrl = `${normalizedBase}/models`;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const latencyMs = Date.now() - start;

      if (response.ok) {
        const data = (await response.json()) as { data?: unknown[] };
        const modelCount = Array.isArray(data?.data) ? data.data.length : undefined;

        loggers.ai.info(
          { baseUrl, type, latencyMs, modelCount, ok: true },
          'Provider connectivity test succeeded'
        );

        res.json({ ok: true, latencyMs, modelCount });
      } else {
        const body = await response.text().catch(() => '');
        loggers.ai.error(
          { baseUrl, type, latencyMs, statusCode: response.status, body: body.slice(0, 500) },
          'Provider connectivity test failed'
        );

        res.json({
          ok: false,
          latencyMs,
          error: `HTTP ${response.status} ${response.statusText}`,
          statusCode: response.status,
        });
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      if (err.name === 'AbortError') {
        res.json({ ok: false, error: 'Connection timed out (10s)', latencyMs });
        return;
      }
      loggers.ai.error(
        { baseUrl, type, latencyMs, error: err.message },
        'Provider connectivity test error'
      );
      res.json({ ok: false, error: err.message, latencyMs });
    }
  })
);

module.exports = router;
```

- [ ] **Step 2: 验证路由文件可被 require 且不报语法错误**

```bash
node -e "const r = require('./src/server/routes/aiConfig'); console.log('routes loaded, stack:', typeof r.stack !== 'undefined' ? r.stack.length : 'ok')"
```

Expected: `routes loaded, stack: 3`（3 个端点）

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/aiConfig.ts
git commit -m "feat(ai): add AI config API routes with provider connectivity test"
```

---

### Task 6: 注册路由到 app.ts

**Files:**
- Modify: `src/server/app.ts:119`（在 wordsV2 路由注册之后插入）

- [ ] **Step 1: 注册 AI 路由**

在 `src/server/app.ts` 第 121 行 `app.use('/api/v2/words', require('./routes/wordsV2'));` 之后添加:

```typescript
app.use('/api/v2', require('./routes/aiConfig'));
```

- [ ] **Step 2: 验证路由注册**

启动 dev server 并测试:

```bash
# Terminal 1 — 启动 server
npm run dev:server

# Terminal 2 — 测试 endpoints
curl -s http://127.0.0.1:8080/api/v2/config/ai | head -c 200
```

Expected: 返回 JSON `{"providers":[],"stages":{},"review":{"threshold":6,"thresholdByLanguage":{}}}`

- [ ] **Step 3: 验证写保护 (PUT 需要 admin token)**

```bash
# 不带 token → 应被拒绝
curl -s -X PUT http://127.0.0.1:8080/api/v2/config/ai \
  -H "Content-Type: application/json" \
  -d '{"review":{"threshold":7}}'
```

Expected: 401 错误

```bash
# 带 token → 应成功
curl -s -X PUT http://127.0.0.1:8080/api/v2/config/ai \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: dev-token-not-for-production" \
  -d '{"review":{"threshold":7}}'
```

Expected: 返回 JSON，`review.threshold` = 7，且 providers 数组为 masked 版本

- [ ] **Step 4: 验证 config.json 写入**

```bash
node -e "
const fs = require('fs');
const raw = fs.readFileSync('config.json', 'utf-8');
const cfg = JSON.parse(raw);
console.log('ai.review.threshold:', cfg.ai?.review?.threshold);
"
```

Expected: `ai.review.threshold: 7`

- [ ] **Step 5: 清理测试数据**

```bash
node -e "
const fs = require('fs');
if (fs.existsSync('config.json')) {
  const cfg = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
  delete cfg.ai;
  fs.writeFileSync('config.json', JSON.stringify(cfg, null, 2), 'utf-8');
}
if (fs.existsSync('config.json.bak')) fs.unlinkSync('config.json.bak');
"
```

- [ ] **Step 6: Commit**

```bash
git add src/server/app.ts
git commit -m "feat(ai): register AI config routes in app"
```

---

### Task 7: 前端 API 封装

**Files:**
- Create: `src/renderer/src/services/aiConfigApi.ts`

- [ ] **Step 1: 创建前端 API 服务**

```typescript
// src/renderer/src/services/aiConfigApi.ts
import request from '@/utils/request';

export interface AIProviderMasked {
  id: string;
  name: string;
  type: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  models: { id: string; name: string }[];
}

export interface AISearchConfigMasked {
  provider: 'brave' | 'tavily';
  apiKey: string;
  autoDomains: boolean;
  domains: { common: string[]; en: string[]; de: string[] };
}

export interface AIStageConfig {
  provider: string;
  model: string;
}

export interface AIConfigMasked {
  providers: AIProviderMasked[];
  search?: AISearchConfigMasked;
  stages: {
    research?: AIStageConfig;
    enrichment?: AIStageConfig;
    review?: AIStageConfig;
  };
  review: {
    threshold: number;
    thresholdByLanguage: Record<string, number>;
  };
}

export interface TestProviderInput {
  baseUrl: string;
  apiKey: string;
  type: 'openai' | 'anthropic';
}

export interface TestProviderResult {
  ok: boolean;
  latencyMs?: number;
  modelCount?: number;
  error?: string;
  statusCode?: number;
}

export const fetchAIConfig = (): Promise<AIConfigMasked> =>
  request.get('/v2/config/ai');

export const saveAIConfig = (config: AIConfigMasked): Promise<AIConfigMasked> =>
  request.put('/v2/config/ai', config);

export const testProvider = (input: TestProviderInput): Promise<TestProviderResult> =>
  request.post('/v2/config/ai/test-provider', input);
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx vue-tsc --noEmit src/renderer/src/services/aiConfigApi.ts
```

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/services/aiConfigApi.ts
git commit -m "feat(ai): add frontend AI config API client"
```

---

### Task 8: Settings UI — AI 配置 Section

**Files:**
- Modify: `src/renderer/src/views/SettingsView.vue`

这是最大的一块。不要做成现有计划里那种纵向堆叠的普通表单；Settings 页最终视觉必须贴近用户提供的截图：一屏式、轻量卡片、紧凑表单、2 列上区 + 全宽下区 + 底部操作栏。

**视觉目标（以上图为准）：**
- 页面背景保持浅色、干净、低饱和；内容区域不是营销页，不要 hero、渐变背景、装饰图形或嵌套卡片。
- 顶部是页面标题 `设置`，副标题为 `AI 配置、供应商、搜索与审核偏好`，标题区左对齐，留白紧凑。
- AI 配置区域使用 4 个同级 panel，边框 `#e5e7eb` 级别、8px 圆角以内、白色/半透明白底、轻微阴影或无阴影。
- 第一行两列：左侧 `1. AI 提供商`，右侧 `2. 阶段模型分配`；宽屏各占 50%，移动端堆叠。
- 第二行全宽：`3. 搜索 API`。第一行放 provider select、API key 输入、查看/更改按钮、自动域名 toggle；下面三行是常用域名/英文域名/德文域名的 tag input。
- 第三行全宽：`4. 审核阈值`。横向放默认阈值、按语言、`en`、`de` 数字输入，带 `1-10` hint。
- 底部右侧固定操作区：`取消` 次按钮 + 绿色主按钮 `保存 AI 配置`。
- 输入控件高度约 32-36px，按钮高度约 32-36px；文字不要过大，panel 标题 14-16px，正文 12-14px。
- 绿色只作为状态和主操作强调色，参考截图里的连接状态 pill 和保存按钮；整体不要变成单一绿色主题。
- Provider 列表要像截图：每个 provider 行包含图标、名称、基础 URL、`已连接` 状态 pill、右箭头；列表容器内部可滚动。
- 阶段模型分配要像截图：阶段 label（研究/增强/审核） + provider select + 箭头 + model select，三行对齐。
- 搜索域名输入用 tag/chip 视觉，不要纯逗号文本输入；tag 有关闭 `x`，空状态 placeholder 为 `添加域名（按 Enter）`。
- 暗色模式可以继承现有主题变量，但浅色截图样式是本任务验收基准。

- [ ] **Step 1: 添加 script 逻辑**

在 `<script setup lang="ts">` 块中（第 96 行 `</script>` 之前，`onMounted` 块之后）添加:

```typescript
// ---- AI Config ----
import {
  fetchAIConfig,
  saveAIConfig,
  testProvider,
  type AIConfigMasked,
  type AIProviderMasked,
  type TestProviderResult,
} from '@/services/aiConfigApi';

const aiConfig = ref<AIConfigMasked | null>(null);
const aiLoading = ref(false);
const aiSaving = ref(false);
const aiError = ref('');

// provider 编辑
const editingProviderIndex = ref<number | null>(null);
const newProviderForm = reactive<AIProviderMasked>({
  id: '', name: '', type: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: [],
});
const showApiKey = ref<Record<string, boolean>>({});

// 连通测试状态
const testingProvider = ref<Record<string, boolean>>({});
const testResults = ref<Record<string, TestProviderResult>>({});

const toggleApiKey = (providerId: string) => {
  showApiKey.value[providerId] = !showApiKey.value[providerId];
};

const loadAIConfig = async () => {
  aiLoading.value = true;
  aiError.value = '';
  try {
    aiConfig.value = await fetchAIConfig();
  } catch (err: any) {
    aiError.value = err.message || 'Failed to load AI config';
  } finally {
    aiLoading.value = false;
  }
};

const handleSaveAIConfig = async () => {
  if (!aiConfig.value) return;
  aiSaving.value = true;
  aiError.value = '';
  try {
    aiConfig.value = await saveAIConfig(aiConfig.value);
    appStore.addToast('AI config saved', 'success');
  } catch (err: any) {
    aiError.value = err.message || 'Failed to save AI config';
    appStore.addToast(aiError.value, 'error');
  } finally {
    aiSaving.value = false;
  }
};

const startAddProvider = () => {
  editingProviderIndex.value = -1; // -1 = new
  Object.assign(newProviderForm, {
    id: '', name: '', type: 'openai' as const,
    baseUrl: 'https://api.openai.com/v1', apiKey: '', models: [],
  });
  testResults.value = {};
};

const startEditProvider = (index: number) => {
  editingProviderIndex.value = index;
  const p = aiConfig.value!.providers[index];
  Object.assign(newProviderForm, JSON.parse(JSON.stringify(p)));
  testResults.value = {};
};

const cancelEditProvider = () => {
  editingProviderIndex.value = null;
};

const saveProvider = () => {
  if (!aiConfig.value || editingProviderIndex.value === null) return;
  if (!newProviderForm.id.trim() || !newProviderForm.name.trim()) return;

  if (editingProviderIndex.value === -1) {
    aiConfig.value.providers.push(JSON.parse(JSON.stringify(newProviderForm)));
  } else {
    aiConfig.value.providers[editingProviderIndex.value] =
      JSON.parse(JSON.stringify(newProviderForm));
  }
  editingProviderIndex.value = null;
};

const removeProvider = (index: number) => {
  if (!aiConfig.value) return;
  const provider = aiConfig.value.providers[index];
  if (!confirm(`Remove provider "${provider.name}" (${provider.id})?`)) return;
  aiConfig.value.providers.splice(index, 1);
  if (editingProviderIndex.value === index) editingProviderIndex.value = null;
};

const handleTestProvider = async (providerIndex: number) => {
  const provider = aiConfig.value!.providers[providerIndex];
  if (provider.apiKey.includes('***')) {
    appStore.addToast('Please enter the full API key before testing', 'error');
    return;
  }
  testingProvider.value[provider.id] = true;
  try {
    const result = await testProvider({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      type: provider.type,
    });
    testResults.value[provider.id] = result;
  } catch (err: any) {
    testResults.value[provider.id] = {
      ok: false,
      error: err.message || 'Test failed',
    };
  } finally {
    testingProvider.value[provider.id] = false;
  }
};

// models string ↔ array conversion
const modelsString = (models: { id: string; name: string }[]): string =>
  models.map(m => m.id === m.name ? m.id : `${m.id}:${m.name}`).join(', ');

const parseModels = (raw: string): { id: string; name: string }[] =>
  raw.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const colonIdx = s.indexOf(':');
    if (colonIdx === -1) return { id: s, name: s };
    return { id: s.slice(0, colonIdx).trim(), name: s.slice(colonIdx + 1).trim() };
  });

// domain strings ↔ array conversion
const domainsString = (arr: string[]): string => arr.join(', ');
const parseDomains = (raw: string): string[] =>
  raw.split(',').map(s => s.trim()).filter(Boolean);

const stageLabel = (stageKey: string): string =>
  ({ research: '研究', enrichment: '增强', review: '审核' })[stageKey] || stageKey;

// 截图样式需要 tag/chip 输入，而不是逗号文本框。
// 实现时为 common/en/de 各维护一个 inline input draft：
// - Enter / comma 添加域名
// - chip 上的 x 删除域名
// - 去重并 trim
// - 空输入显示 placeholder: 添加域名（按 Enter）
const domainDrafts = reactive<Record<'common' | 'en' | 'de', string>>({
  common: '',
  en: '',
  de: '',
});

onMounted(() => {
  loadAIConfig();
});
```

- [ ] **Step 2: 添加 AI Config Template**

在 `<!-- Onboarding -->` section（第 193 行）之前插入 AI config section。**不要照搬旧的纵向 `ai-subsection` 模板**；按截图重写为 `settings-ai-page` + `ai-settings-grid` + 4 个同级 `ai-panel`。

推荐 DOM 结构如下，字段绑定可复用下面旧代码片段中的 `aiConfig`、`editingProviderIndex`、`showApiKey`、`handleSaveAIConfig` 等逻辑，但最终布局以此结构为准：

```html
        <!-- AI Configuration -->
        <div class="settings-ai-page">
          <header class="settings-ai-header">
            <h1>设置</h1>
            <p>AI 配置、供应商、搜索与审核偏好</p>
          </header>

          <div v-if="aiLoading" class="status-text">加载中...</div>
          <div v-else-if="!aiConfig" class="status-text">暂未配置 AI</div>

          <template v-else>
            <div class="ai-settings-grid">
              <section class="ai-panel ai-panel-providers">
                <header class="ai-panel-header">
                  <h2>1. AI 提供商</h2>
                  <p>管理 LLM 提供商连接</p>
                </header>

                <div class="provider-list">
                  <button
                    v-for="(provider, pIdx) in aiConfig.providers"
                    :key="provider.id"
                    type="button"
                    class="provider-row"
                    @click="startEditProvider(pIdx)"
                  >
                    <span class="provider-icon" :class="'provider-icon-' + provider.type">
                      {{ provider.name.slice(0, 1) }}
                    </span>
                    <span class="provider-copy">
                      <strong>{{ provider.name }}</strong>
                      <small>基础 URL：{{ provider.baseUrl }}</small>
                    </span>
                    <span class="provider-status">已连接</span>
                    <span class="provider-chevron">›</span>
                  </button>
                </div>

                <button class="btn btn-compact" type="button" @click="startAddProvider">
                  + 添加提供商
                </button>
              </section>

              <section class="ai-panel ai-panel-stages">
                <header class="ai-panel-header">
                  <h2>2. 阶段模型分配</h2>
                  <p>为每个 AI 流程阶段分配提供商和模型</p>
                </header>

                <div
                  v-for="stageKey of ['research', 'enrichment', 'review']"
                  :key="stageKey"
                  class="stage-assignment-row"
                >
                  <span class="stage-label">{{ stageLabel(stageKey) }}</span>
                  <select class="field-control"><!-- provider options --></select>
                  <span class="stage-arrow">→</span>
                  <select class="field-control"><!-- model options --></select>
                </div>
              </section>

              <section class="ai-panel ai-panel-search">
                <header class="ai-panel-header">
                  <h2>3. 搜索 API</h2>
                  <p>配置网页搜索提供商与域名偏好</p>
                </header>

                <div class="search-api-row">
                  <label class="field-stack">
                    <span>提供商</span>
                    <select v-model="aiConfig.search.provider" class="field-control"></select>
                  </label>
                  <label class="field-stack search-key-field">
                    <span>API Key</span>
                    <input v-model="aiConfig.search.apiKey" class="field-control" type="password" />
                  </label>
                  <button class="btn btn-compact" type="button">更改</button>
                  <label class="toggle-field">
                    <span>自动域名</span>
                    <small>自动选择搜索域名</small>
                    <input v-model="aiConfig.search.autoDomains" type="checkbox" role="switch" />
                  </label>
                </div>

                <div class="domain-rows">
                  <label class="domain-row">
                    <span>常用域名</span>
                    <div class="tag-input"><!-- chips + inline input --></div>
                  </label>
                  <label class="domain-row">
                    <span>英文域名</span>
                    <div class="tag-input"><!-- chips + inline input --></div>
                  </label>
                  <label class="domain-row">
                    <span>德文域名</span>
                    <div class="tag-input"><!-- chips + inline input --></div>
                  </label>
                </div>
              </section>

              <section class="ai-panel ai-panel-review">
                <header class="ai-panel-header">
                  <h2>4. 审核阈值</h2>
                  <p>低于阈值的字段需要人工审核</p>
                </header>

                <div class="threshold-row">
                  <label>默认阈值 <input class="number-control" type="number" min="1" max="10" /></label>
                  <span class="range-hint">1-10</span>
                  <strong>按语言</strong>
                  <label>en <input class="number-control" type="number" min="1" max="10" /></label>
                  <span class="range-hint">1-10</span>
                  <label>de <input class="number-control" type="number" min="1" max="10" /></label>
                  <span class="range-hint">1-10</span>
                </div>
              </section>
            </div>

            <footer class="ai-settings-actions">
              <button class="btn" type="button">取消</button>
              <button class="btn btn-primary" :disabled="aiSaving" @click="handleSaveAIConfig">
                {{ aiSaving ? '保存中...' : '保存 AI 配置' }}
              </button>
            </footer>
          </template>
        </div>
```

旧模板片段保留在下方仅作为绑定参考；执行本计划时应把它折叠进上面的截图式结构，而不是按旧 DOM 原样实现：

```html
        <!-- AI Configuration -->
        <div class="settings-section">
          <div class="section-title">AI 配置</div>
          <div class="section-desc">管理 LLM 供应商、搜索 API 和生成参数。</div>

          <div v-if="aiLoading" class="status-text">加载中...</div>
          <div v-else-if="!aiConfig" class="status-text">暂未配置 AI</div>

          <template v-else>
            <!-- 9.1 Providers -->
            <div class="ai-subsection">
              <div class="ai-subsection-title">Providers</div>
              <div
                v-for="(provider, pIdx) in aiConfig.providers"
                :key="provider.id"
                class="provider-card"
              >
                <!-- Read mode -->
                <template v-if="editingProviderIndex !== pIdx">
                  <div class="provider-summary">
                    <span class="provider-name">{{ provider.name }}</span>
                    <span class="badge" :class="'badge-' + provider.type">{{ provider.type }}</span>
                    <span class="provider-url">{{ provider.baseUrl }}</span>
                    <span class="provider-key">
                      <template v-if="showApiKey[provider.id]">{{ provider.apiKey }}</template>
                      <template v-else>••••••••</template>
                    </span>
                    <span class="provider-models">{{ modelsString(provider.models) }}</span>
                  </div>
                  <div class="provider-actions">
                    <button
                      class="btn btn-sm"
                      :disabled="testingProvider[provider.id]"
                      @click="handleTestProvider(pIdx)"
                    >
                      {{ testingProvider[provider.id] ? '测试中...' : 'Test' }}
                    </button>
                    <button class="btn btn-sm" @click="toggleApiKey(provider.id)">
                      {{ showApiKey[provider.id] ? 'Hide' : 'Show' }}
                    </button>
                    <button class="btn btn-sm" @click="startEditProvider(pIdx)">Edit</button>
                    <button class="btn btn-sm" @click="removeProvider(pIdx)">Remove</button>
                  </div>
                  <div
                    v-if="testResults[provider.id]"
                    class="test-result"
                    :class="testResults[provider.id].ok ? 'test-ok' : 'test-fail'"
                  >
                    <template v-if="testResults[provider.id].ok">
                      ✓ 连接成功 ({{ testResults[provider.id].latencyMs }}ms)
                      <span v-if="testResults[provider.id].modelCount">
                        — {{ testResults[provider.id].modelCount }} models
                      </span>
                    </template>
                    <template v-else>
                      ✗ {{ testResults[provider.id].error }}
                    </template>
                  </div>
                </template>

                <!-- Edit mode -->
                <template v-else>
                  <div class="provider-form">
                    <label class="form-label">
                      ID:
                      <input v-model="newProviderForm.id" class="form-input" placeholder="openai" :disabled="pIdx >= 0" />
                    </label>
                    <label class="form-label">
                      Name:
                      <input v-model="newProviderForm.name" class="form-input" placeholder="OpenAI" />
                    </label>
                    <label class="form-label">
                      Type:
                      <select v-model="newProviderForm.type" class="form-input">
                        <option value="openai">OpenAI-compatible</option>
                        <option value="anthropic">Anthropic-compatible</option>
                      </select>
                    </label>
                    <label class="form-label">
                      Base URL:
                      <input v-model="newProviderForm.baseUrl" class="form-input" />
                    </label>
                    <label class="form-label">
                      API Key:
                      <input
                        v-model="newProviderForm.apiKey"
                        class="form-input"
                        :type="showApiKey['_form'] ? 'text' : 'password'"
                      />
                      <button class="btn btn-sm" @click="showApiKey._form = !showApiKey._form">
                        {{ showApiKey._form ? 'Hide' : 'Show' }}
                      </button>
                    </label>
                    <label class="form-label">
                      Models (id:name, 逗号分隔):
                      <input
                        :value="modelsString(newProviderForm.models)"
                        @input="newProviderForm.models = parseModels(($event.target as HTMLInputElement).value)"
                        class="form-input"
                        placeholder="gpt-4o, gpt-4o-mini:GPT-4o Mini"
                      />
                    </label>
                    <div class="provider-form-actions">
                      <button class="btn btn-primary" @click="saveProvider">Save</button>
                      <button class="btn" @click="cancelEditProvider">Cancel</button>
                    </div>
                  </div>
                </template>
              </div>

              <button v-if="editingProviderIndex === null" class="btn btn-sm" @click="startAddProvider">
                + Add Provider
              </button>
            </div>

            <!-- 9.2 Stage Assignment -->
            <div class="ai-subsection">
              <div class="ai-subsection-title">Stage Model Assignment</div>
              <div v-for="stageKey of ['research', 'enrichment', 'review']" :key="stageKey" class="stage-row">
                <span class="stage-label">{{ stageKey }}</span>
                <select
                  :value="(aiConfig.stages as any)[stageKey]?.provider || ''"
                  @change="(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    const st = aiConfig!.stages as Record<string, any>;
                    if (!st[stageKey]) st[stageKey] = { provider: '', model: '' };
                    st[stageKey].provider = val;
                    st[stageKey].model = '';
                  }"
                  class="form-input"
                >
                  <option value="">--</option>
                  <option v-for="p in aiConfig.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
                <span class="stage-colon">:</span>
                <select
                  :value="(aiConfig.stages as any)[stageKey]?.model || ''"
                  @change="(e: Event) => {
                    const val = (e.target as HTMLSelectElement).value;
                    const st = aiConfig!.stages as Record<string, any>;
                    if (st[stageKey]) st[stageKey].model = val;
                  }"
                  class="form-input"
                  :disabled="!(aiConfig.stages as any)[stageKey]?.provider"
                >
                  <option value="">--</option>
                  <template v-for="p in aiConfig.providers" :key="p.id">
                    <option
                      v-if="p.id === (aiConfig.stages as any)[stageKey]?.provider"
                      v-for="m in p.models"
                      :key="m.id"
                      :value="m.id"
                    >{{ m.name }}</option>
                  </template>
                </select>
              </div>
            </div>

            <!-- 9.3 Search API -->
            <div class="ai-subsection">
              <div class="ai-subsection-title">Search API</div>
              <template v-if="aiConfig.search">
                <label class="form-label">
                  Provider:
                  <select v-model="aiConfig.search.provider" class="form-input">
                    <option value="brave">Brave Search</option>
                    <option value="tavily">Tavily</option>
                  </select>
                </label>
                <label class="form-label">
                  API Key:
                  <input
                    v-model="aiConfig.search.apiKey"
                    class="form-input"
                    :type="showApiKey['_search'] ? 'text' : 'password'"
                  />
                  <button class="btn btn-sm" @click="showApiKey._search = !showApiKey._search">
                    {{ showApiKey._search ? 'Hide' : 'Show' }}
                  </button>
                </label>
                <label class="form-label">
                  <input type="checkbox" v-model="aiConfig.search.autoDomains" />
                  Auto domains (自动选择搜索域名)
                </label>
                <label class="form-label">
                  Common domains:
                  <input
                    :value="domainsString(aiConfig.search.domains.common)"
                    @input="aiConfig!.search!.domains.common = parseDomains(($event.target as HTMLInputElement).value)"
                    class="form-input"
                    placeholder="etymonline.com, wiktionary.org"
                  />
                </label>
              </template>
              <p v-else class="empty-text">No search API configured.</p>
            </div>

            <!-- 9.4 Review Threshold -->
            <div class="ai-subsection">
              <div class="ai-subsection-title">Review Threshold</div>
              <div class="stage-row">
                <span class="stage-label">Default</span>
                <select v-model.number="aiConfig.review.threshold" class="form-input">
                  <option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
                </select>
              </div>
            </div>

            <!-- Save & Error -->
            <div class="ai-actions">
              <button class="btn btn-primary" :disabled="aiSaving" @click="handleSaveAIConfig">
                {{ aiSaving ? 'Saving...' : 'Save AI Config' }}
              </button>
              <span v-if="aiError" class="test-fail">{{ aiError }}</span>
            </div>
          </template>
        </div>
```

- [ ] **Step 3: 添加 AI 配置样式**

在 `<style scoped>` 块末尾（第 435 行之前）添加。**最终样式以这一组截图式 CSS 为准**；如果下方旧 `.ai-subsection` CSS 与这里冲突，删除旧规则或改名，避免页面回到纵向堆叠表单。

```css
/* ---- AI Settings screenshot layout ---- */
.settings-ai-page {
  min-height: calc(100vh - 96px);
  padding: 22px 28px 14px;
  background: var(--bg);
  color: var(--text);
}

.settings-ai-header {
  margin-bottom: 16px;
}

.settings-ai-header h1 {
  margin: 0 0 6px;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 750;
  letter-spacing: 0;
}

.settings-ai-header p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.ai-settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.ai-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  padding: 16px 18px;
}

.ai-panel-search,
.ai-panel-review {
  grid-column: 1 / -1;
}

.ai-panel-header {
  margin-bottom: 14px;
}

.ai-panel-header h2 {
  margin: 0 0 4px;
  font-size: 15px;
  line-height: 1.3;
  font-weight: 750;
  letter-spacing: 0;
}

.ai-panel-header p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.provider-list {
  max-height: 148px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
}

.provider-row {
  width: 100%;
  min-height: 62px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.provider-row:last-child {
  border-bottom: 0;
}

.provider-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font-weight: 750;
}

.provider-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.provider-copy strong,
.provider-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-copy strong {
  font-size: 13px;
}

.provider-copy small {
  color: var(--muted);
  font-size: 12px;
}

.provider-status {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green);
  font-size: 12px;
  font-weight: 650;
}

.provider-chevron,
.stage-arrow {
  color: var(--muted);
  font-size: 18px;
}

.stage-assignment-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 24px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.stage-label {
  font-size: 14px;
  font-weight: 650;
}

.search-api-row {
  display: grid;
  grid-template-columns: minmax(180px, 320px) minmax(220px, 1fr) auto minmax(210px, 260px);
  align-items: end;
  gap: 14px;
  margin-bottom: 14px;
}

.field-stack,
.domain-row {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
}

.field-control,
.tag-input,
.number-control {
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
}

.field-control {
  width: 100%;
  padding: 0 12px;
}

.toggle-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "label switch"
    "hint switch";
  align-items: center;
  gap: 2px 12px;
  font-size: 13px;
  font-weight: 650;
}

.toggle-field small {
  grid-area: hint;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}

.domain-rows {
  display: grid;
  gap: 8px;
}

.domain-row {
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
}

.tag-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
}

.domain-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-soft);
  font-size: 12px;
}

.threshold-row {
  display: grid;
  grid-template-columns: auto 86px 48px auto auto 86px 48px auto 86px 48px;
  align-items: center;
  gap: 14px;
}

.number-control {
  width: 72px;
  padding: 0 10px;
}

.range-hint {
  color: var(--muted);
  font-size: 12px;
}

.ai-settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 14px;
}

.btn-compact {
  height: 34px;
  padding: 0 12px;
}

.ai-settings-actions .btn-primary {
  min-width: 132px;
  background: var(--green);
  border-color: var(--green);
}

@media (max-width: 900px) {
  .settings-ai-page {
    padding: 18px 16px 12px;
  }

  .ai-settings-grid,
  .search-api-row,
  .stage-assignment-row,
  .threshold-row,
  .domain-row {
    grid-template-columns: 1fr;
  }

  .ai-panel-search,
  .ai-panel-review {
    grid-column: auto;
  }

  .stage-arrow {
    display: none;
  }
}
```

旧样式片段如下，仅用于迁移已有 class 时参考，不作为最终视觉验收标准:

```css
/* ---- AI Config ---- */
.ai-subsection {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.ai-subsection-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}

.provider-card {
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.provider-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.provider-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
}

.provider-url {
  font-size: 11px;
  color: var(--muted);
  word-break: break-all;
}

.provider-key {
  font-size: 11px;
  font-family: monospace;
  color: var(--muted);
}

.provider-models {
  font-size: 11px;
  color: var(--text-soft);
}

.provider-actions {
  display: flex;
  gap: 6px;
}

.provider-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-form-actions {
  display: flex;
  gap: 6px;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--muted);
}

.form-input {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
}

.form-input:disabled {
  opacity: 0.5;
}

.stage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.stage-label {
  width: 90px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-transform: capitalize;
}

.stage-colon {
  font-weight: 700;
  color: var(--muted);
}

.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.badge-openai {
  background: var(--green-soft);
  color: var(--green);
}

.badge-anthropic {
  background: #fce4d6;
  color: #c25b1e;
}

[data-theme="dark"] .badge-anthropic {
  background: #3d2a1a;
  color: #e8944a;
}

.test-result {
  margin-top: 4px;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.test-ok {
  background: var(--green-soft);
  color: var(--green);
}

.test-fail {
  background: #fce4e4;
  color: var(--red);
}

[data-theme="dark"] .test-fail {
  background: #3d1a1a;
}

.ai-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
```

- [ ] **Step 4: 验证前端编译**

```bash
npm run type-check
```

Expected: 无新增 type 错误

- [ ] **Step 5: 运行 lint**

```bash
npm run lint:fix
```

修复所有 lint 问题后重试，确保无错误。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/views/SettingsView.vue
git commit -m "feat(ai): add AI config section to Settings page"
```

---

### Task 9: E2E 验证 + 收尾

**Files:**
- 无新建文件

- [ ] **Step 1: 启动 dev server**

```bash
npm run dev:web
```

- [ ] **Step 2: 手动测试流程**

在浏览器中打开 `http://localhost:5173/settings`:

1. **Provider CRUD**:
   - 点击 "+ Add Provider"
   - 填入: ID=`test-openai`, Name=`Test OpenAI`, type=`openai`, Base URL=`https://api.openai.com/v1`, API Key=<你的真实 key>, Models=`gpt-4o-mini:GPT-4o Mini, gpt-4o`
   - 点击 Save → provider 卡片出现
   - 点击 Test → 应显示 `✓ 连接成功 (xxxms) — N models`
   - 点击 Edit → 修改 name → Save
   - 点击 Remove → confirm → provider 消失

2. **Stage Assignment**:
   - Research: 选择 test-openai → 选择 gpt-4o-mini
   - Enrichment: 选择 test-openai → 选择 gpt-4o
   - Review: 选择 test-openai → 选择 gpt-4o

3. **Search API**:
   - 填入 Brave API Key

4. **Save All**:
   - 点击 "Save AI Config" → toast "AI config saved"
   - 刷新页面 → 配置应仍然存在（从 config.json 加载，API Key 显示为 masked）

5. **config.json 验证**:
   ```bash
   node -e "const fs = require('fs'); const c = JSON.parse(fs.readFileSync('config.json','utf-8')); console.log('providers:', c.ai?.providers?.length); console.log('threshold:', c.ai?.review?.threshold);"
   ```
   Expected: providers: 1, threshold: 6

- [ ] **Step 3: 运行全部测试**

```bash
npm run test
```

Expected: 所有已有测试 PASS + configService 测试 PASS

- [ ] **Step 4: 运行 lint 最终检查**

```bash
npm run lint
```

- [ ] **Step 5: 清理并 Commit**

```bash
# 如果 config.json 中有测试数据，clean it
node -e "const fs=require('fs');if(fs.existsSync('config.json')){const c=JSON.parse(fs.readFileSync('config.json','utf-8'));delete c.ai;fs.writeFileSync('config.json',JSON.stringify(c,null,2));}['.bak','.tmp'].forEach(s=>{const p='config.json'+s;if(fs.existsSync(p))fs.unlinkSync(p)})"

git add -A
git commit -m "feat(ai): complete AI settings configuration page"
```

- [ ] **Step 6: 运行 type-check 最终确认**

```bash
npm run type-check
```

---

## 完成标准

- [x] config.json 支持读写，含备份(.bak)和原子写(.tmp rename)
- [ ] GET `/api/v2/config/ai` 返回脱敏配置
- [ ] PUT `/api/v2/config/ai` 需要 admin token，Zod 校验，保存到 config.json
- [ ] POST `/api/v2/config/ai/test-provider` 返回连通性结果
- [ ] Settings 页面 4 个 AI 配置子区块正常工作
- [ ] Settings 页面视觉符合参考图：上方两列 panel、搜索/阈值全宽 panel、紧凑控件、tag/chip 域名输入、右下角取消/保存操作区
- [ ] Provider 卡片: 添加/编辑/删除/测试连接
- [ ] Stage 模型选择: provider 下拉 → 级联 model 下拉
- [ ] API Key: 保存后返回 masked 值，输入含 `***` 时保留旧值
- [ ] maskApiKey 和 mergeWithMaskedCheck 单元测试通过
- [ ] 日志记录: provider 测试结果和 config 保存事件写入 pino ai logger
