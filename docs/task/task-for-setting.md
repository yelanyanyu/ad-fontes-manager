# Task: AI Settings 配置页面实现

> **状态**: 计划完成，待实现
> **关联**: `docs/task/task-for-agent.md`（总体设计）、`docs/task/task-for-agent-plan.md`（完整实现计划）
> **优先级**: 最高 — 这是整个 AI 模块的基石，必须先测试完备

---

## 目标

在 Settings 页面新增 AI 配置区块，包含 Provider 管理、Stage 模型分配、Search API 配置、Review 阈值。同时补齐 config.json 读写能力（当前仅有 env + defaults 内存模式）。

---

## 零、前置分析：当前 config 系统 vs 需求

### 现状

`src/server/utils/config.ts` 仅支持：
- `defaultConfig` (硬编码默认值)
- `loadFromEnv()` (env var → 嵌套 config 对象)
- Zod 校验 + 内存缓存

**没有** config.json 文件读写。项目目录下无任何 `config.json`。

### 需求

Settings 页面需要：
1. **GET** `/api/v2/config/ai` → 返回脱敏 AI 配置（API Key 仅显示 `sk-***xxxx`）
2. **PUT** `/api/v2/config/ai` → 保存 AI 配置到持久化存储
3. 服务重启后配置不丢失
4. `.env` 可覆盖敏感字段（`AI_SEARCH_API_KEY` 等）

### 方案

**在 config.ts 中添加 `config.json` 读写能力**（通用能力，不止 AI 用）：
- 启动时：`config.json` → merge defaults → merge env → Zod 校验
- PUT 时：读取 `config.json` 原始文件 → 深度合并更新 → 写回 → 清除缓存
- config.json 路径：`path.join(process.cwd(), 'config.json')`（web）/ Electron userData（桌面）— 由调用方传入或自动检测

---

## 一、文件结构

```
新增:
  src/server/schemas/aiConfig.ts        # AI 配置 Zod schemas
  src/server/services/ai/configService.ts  # AI 配置读写 + 脱敏 + 校验
  src/server/routes/aiConfig.ts         # GET/PUT /api/v2/config/ai
  src/renderer/src/services/aiConfigApi.ts  # 前端 API 封装

修改:
  src/server/schemas/config.ts          # 添加 ai 字段到顶层层 ConfigSchema
  src/server/utils/config.ts            # 添加 config.json 文件读写 + AI env mapping
  src/server/utils/logger.ts            # 添加 loggers.ai
  src/server/app.ts                     # 注册 /api/v2/config/ai 路由
  src/renderer/src/views/SettingsView.vue  # 新增 AI 配置区块
  src/renderer/src/stores/appStore.ts   # 可能需要：toast 方法已存在，检查即可
```

---

## 二、Config JSON 读写（通用能力）

### 在 config.ts 中添加

```typescript
// 确定 config.json 路径
function resolveConfigPath(): string {
  if (process.env.ADFONTES_CONFIG_PATH) return process.env.ADFONTES_CONFIG_PATH;
  // Desktop: Electron 设置 ADFONTES_CONFIG_PATH 指向 userData/config.json
  // Web: cwd/config.json
  return path.join(process.cwd(), 'config.json');
}

// 从文件加载原始 JSON
function loadConfigFile(): ConfigObject {
  const configPath = resolveConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw) as ConfigObject;
    }
  } catch (err) {
    console.warn(`Failed to read ${configPath}, using defaults`);
  }
  return {};
}

// 写前备份：rename 旧文件为 .bak（claude-code 启发）
function backupConfigFile(configPath: string): void {
  if (!fs.existsSync(configPath)) return;
  const bakPath = configPath + '.bak';
  try {
    fs.copyFileSync(configPath, bakPath);
  } catch {
    // backup failure is non-fatal
  }
}

// 原子写：先写临时文件再 rename，避免写一半崩溃损坏配置（claude-code 启发）
function saveConfigFile(config: ConfigObject): void {
  const configPath = resolveConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmpPath = configPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  backupConfigFile(configPath);
  fs.renameSync(tmpPath, configPath);  // atomic on most OSes
  clearCache();
}
```

### 启动时加载流程改为

```
config.json (文件) → defaults (补缺) → env vars (覆盖) → Zod 校验
```

`loadConfig()` 改为 `validateConfig(deepMerge(defaultConfig, deepMerge(loadConfigFile(), loadFromEnv())))`

---

## 三、AI Config Schema

### `src/server/schemas/aiConfig.ts`

```typescript
const z = require('zod');

const AIProviderSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/, 'Provider ID must be lowercase alphanumeric'),
  name: z.string().min(1),
  type: z.enum(['openai', 'anthropic']).default('openai'),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  })).min(1, 'At least one model is required'),
});

const AISearchConfigSchema = z.object({
  provider: z.enum(['brave', 'tavily']).default('brave'),
  apiKey: z.string().min(1),
  autoDomains: z.boolean().default(false),
  domains: z.object({
    common: z.array(z.string()).default([]),
    en: z.array(z.string()).default([]),
    de: z.array(z.string()).default([]),
  }).default({}),
});

const AIStageConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

const AIConfigSchema = z.object({
  providers: z.array(AIProviderSchema).default([]),
  search: AISearchConfigSchema.optional(),
  stages: z.object({
    research: AIStageConfigSchema.optional(),
    enrichment: AIStageConfigSchema.optional(),
    review: AIStageConfigSchema.optional(),
  }).default({}),
  review: z.object({
    threshold: z.number().int().min(1).max(10).default(6),
    thresholdByLanguage: z.record(z.number().int().min(1).max(10)).default({}),
  }).default({}),
});

module.exports = { AIConfigSchema, AIProviderSchema, AISearchConfigSchema, AIStageConfigSchema };
```

### 扩展顶层 ConfigSchema（`src/server/schemas/config.ts`）

在 `ConfigSchema` 的 `.object({...})` 中添加 `ai: AIConfigSchema.optional()`。

---

## 四、Env 映射（config.ts）

AI 相关的 env var 覆盖：

| 环境变量 | 映射路径 |
|----------|----------|
| `AI_SEARCH_API_KEY` | `ai.search.apiKey` |
| `AI_SEARCH_PROVIDER` | `ai.search.provider` |
| `AI_REVIEW_THRESHOLD` | `ai.review.threshold` |
| `AI_RESEARCH_PROVIDER` | `ai.stages.research.provider` |
| `AI_RESEARCH_MODEL` | `ai.stages.research.model` |
| `AI_ENRICHMENT_PROVIDER` | `ai.stages.enrichment.provider` |
| `AI_ENRICHMENT_MODEL` | `ai.stages.enrichment.model` |
| `AI_REVIEW_PROVIDER` | `ai.stages.review.provider` |
| `AI_REVIEW_MODEL` | `ai.stages.review.model` |

Providers 数组无法通过 env 单值映射（数组结构），仅通过 config.json 配置。

---

## 五、AI Config Service

### `src/server/services/ai/configService.ts`

职责：
1. **getAIConfig()**: 从 config 系统读取完整 AI 配置
2. **getAIConfigMasked()**: 脱敏版本（API Key → `sk-***xxxx` 格式）
3. **updateAIConfig(input)**: Zod 校验 → 合并到 config.json → 写回
4. **maskApiKey(key)**: `sk-` 前缀保留前 3 后 4；其他保留前 3 后 3

```typescript
function maskApiKey(key: string): string {
  if (key.length <= 8) return '***';
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}***${suffix}`;
}

function maskConfig(ai: AIConfig): AIConfigMasked {
  return {
    ...ai,
    providers: ai.providers.map(p => ({ ...p, apiKey: maskApiKey(p.apiKey) })),
    search: ai.search ? { ...ai.search, apiKey: maskApiKey(ai.search.apiKey) } : undefined,
  };
}

// PUT 处理：如果传入的 apiKey 是脱敏值（包含 ***），保留原 key
function mergeWithMaskedCheck(input: AIConfigUpdate, existing: AIConfig): AIConfig {
  // 对每个 provider：如果 input.apiKey 包含 ***，用 existing 的值替换
  // 对 search.apiKey：同理
}
```

---

## 六、API 路由

### `src/server/routes/aiConfig.ts`

```
GET  /api/v2/config/ai             → 返回脱敏 AI 配置
PUT  /api/v2/config/ai             → 保存 AI 配置 (requireWriteAccess + validateBody)
POST /api/v2/config/ai/test-provider → 测试 provider 连通性 (requireWriteAccess)
```

- GET 不需要 admin token（只读脱敏数据）
- PUT / POST 需要 admin token
- 使用 `asyncHandler` + Zod validateBody 中间件
- 遵循项目现有的 `express.Router()` + `module.exports` 模式

#### Provider 连通性测试

`POST /api/v2/config/ai/test-provider` 接收 provider 配置（baseUrl + apiKey + type），发一个最小请求验证连通性：

```typescript
// Body: { baseUrl: string, apiKey: string, type: 'openai' | 'anthropic' }

// OpenAI-compatible: GET {baseUrl}/models (list models endpoint)
// Anthropic-compatible: 同样尝试 GET models 或最小 chat 请求

// 返回:
// 成功 → { ok: true, latencyMs: number, modelCount?: number }
// 失败 → { ok: false, error: string, statusCode?: number }
```

**超时**: 10 秒（避免用户等太久）
**重试**: 不重试（测试本身就是验证连通性，重试无意义）
**日志**: 记录测试结果到 `loggers.ai`，含 latency + provider 信息

---

## 七、Logger

### 修改 `src/server/utils/logger.ts`

在 loggers 对象中加入：
```typescript
ai: createModuleLogger('ai'),
```

---

## 八、前端 API 封装

### `src/renderer/src/services/aiConfigApi.ts`

```typescript
import request from '@/utils/request';

export interface AIProviderMasked {
  id: string;
  name: string;
  type: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;  // masked: "sk-***xxxx"
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

export const fetchAIConfig = (): Promise<AIConfigMasked> =>
  request.get('/v2/config/ai');

export const saveAIConfig = (config: AIConfigMasked): Promise<void> =>
  request.put('/v2/config/ai', config);

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

export const testProvider = (input: TestProviderInput): Promise<TestProviderResult> =>
  request.post('/v2/config/ai/test-provider', input);
```

---

## 九、Settings UI 设计

### 在 SettingsView.vue 中新增 AI 配置 section

布局分为 4 个子区块（每块一个 `.settings-section`）：

#### 9.1 Providers 管理

```
┌─ AI Providers ─────────────────────────────────────┐
│ 管理 LLM 供应商连接                                   │
│                                                     │
│ ┌─ openai ─────────────────────────────────────┐   │
│ │ 名称: OpenAI                    [类型: openai] │   │
│ │ Base URL: https://api.openai.com/v1           │   │
│ │ API Key:  sk-***abcd          [Show] [Change] │   │
│ │ Models: gpt-4o, gpt-4o-mini, gpt-4    [Edit] │   │
│ │ [Test Connection] [Edit] [Remove]             │   │
│ └────────────────────────────────────────────────┘   │
│                                                     │
│ [+ Add Provider]                                    │
└─────────────────────────────────────────────────────┘
```

每个 provider 是一个卡片：
- **只读模式**: 显示 name, type badge, baseUrl, masked API Key, models 标签
- **编辑模式**: 点击 Edit 按钮展开内联表单
- **API Key 处理**: 输入框显示 masked 值；用户修改时，仅当值变化且不含 `***` 时才将新值发送后端
- **Models 编辑**: 逗号分隔文本或 key:value 对（`gpt-4o: GPT-4o, gpt-4o-mini: GPT-4o Mini`）
- **Test Connection 按钮**: 调用 `POST /api/v2/config/ai/test-provider`
  - 发送当前卡片上的 baseUrl + apiKey + type
  - 显示状态反馈：成功 → 绿色 `✓ 连接成功 (235ms)`；失败 → 红色 `✗ 401 Unauthorized`
  - 测试期间按钮 disabled，显示 spinner
  - apiKey 已 masked 时（含 `***`），需要用户先输入完整 key 才能测试

#### 9.2 Stage 模型分配

```
┌─ Stage Model Assignment ───────────────────────────┐
│ 为每个 Pipeline 阶段选择模型                          │
│                                                     │
│ Research:    [openai ▼] : [gpt-4o-mini ▼]          │
│ Enrichment:  [openai ▼] : [gpt-4o ▼]               │
│ Review:      [openai ▼] : [gpt-4o ▼]               │
└─────────────────────────────────────────────────────┘
```

- Provider 下拉来自已配置的 providers 列表
- Model 下拉根据选中的 provider 动态过滤
- 未配置 stage 时不阻止保存，但在生成时会提示

#### 9.3 Search API 配置

```
┌─ Search API ────────────────────────────────────────┐
│ Provider: [Brave ▼]                                 │
│ API Key:  ***abcd              [Show] [Change]      │
│                                                     │
│ Auto domains: [✓] 自动选择搜索域名                    │
│                                                     │
│ Common domains:                                      │
│   etymonline.com, wiktionary.org, merriam-webster   │
│   [Edit]                                            │
│                                                     │
│ EN domains: (English-specific)                      │
│   oed.com                                           │
│   [Edit]                                            │
└─────────────────────────────────────────────────────┘
```

#### 9.4 Review 阈值

```
┌─ Review Threshold ─────────────────────────────────┐
│ 评分低于阈值的字段需要用户确认                          │
│                                                     │
│ Default:  [6 ▼]  (1-10)                             │
│                                                     │
│ Per language:                                       │
│   en: [6 ▼]    de: [6 ▼]                            │
└─────────────────────────────────────────────────────┘
```

### 状态管理

使用 Vue 3 `ref` / `reactive` 本地状态，不需要 Pinia store：
- `aiConfig: ref<AIConfigMasked | null>(null)`
- `loading: ref(false)`
- `editingProviderIndex: ref<number | null>(null)` — 当前编辑的 provider 卡片
- `providerForm: reactive<AIProviderMasked>` — provider 编辑表单

### 交互细节

- **Add Provider 按钮** → 在列表末尾插入空白卡片，自动进入编辑模式
- **Remove Provider** → 弹出确认（"Remove provider xxx?"），确认后从列表删除
- **Show/Hide API Key** → toggle 显示完整 key（需先 unmask，从后端重新获取？不，用户体验不好。改为：点击 Show 时调用 GET 返回 unmasked 值？也不安全。简单做法：本地 toggle，但后端始终返回 masked；用户想看完整 key 需去 config.json 查看或通过 env 设置。实际上更好的做法是：Show 按钮临时展示当前输入的完整值（仅在用户刚输入时可用），已保存的 masked key 只能 Change 不能 Show。）
- **Save 按钮** → 保存整个 AI config（一次性提交所有修改）

**简化方案** (推荐):
- API Key 以 password 字段展示，默认 `type="password"`，点击眼睛图标切换可见性
- 编辑模式下显示实际 key（从本地表单状态），保存后后端返回 masked
- Change API Key 时显示空输入框让用户输入新 key

---

## 十、实现步骤

### Step 1: AI Config Schema

- 创建 `src/server/schemas/aiConfig.ts`
- 扩展 `src/server/schemas/config.ts` 的 `ConfigSchema`

### Step 2: Config 系统升级

- 修改 `src/server/utils/config.ts`：添加 config.json 读写 + 写前备份 + 原子写 + AI defaults + AI env mapping + `saveConfigFile()` + `resolveConfigPath()`

### Step 3: Logger

- 在 `src/server/utils/logger.ts` 添加 `loggers.ai`

### Step 4: AI Config Service

- 创建 `src/server/services/ai/configService.ts`：`getAIConfig()`, `getAIConfigMasked()`, `updateAIConfig()`, `maskApiKey()`, `mergeWithMaskedCheck()`

### Step 5: API Routes

- 创建 `src/server/routes/aiConfig.ts`：GET + PUT 端点

### Step 6: 注册路由

- 修改 `src/server/app.ts`：添加 `app.use('/api/v2', require('./routes/aiConfig'))`

### Step 7: 前端 API 服务

- 创建 `src/renderer/src/services/aiConfigApi.ts`

### Step 8: Settings UI

- 修改 `src/renderer/src/views/SettingsView.vue`：添加 AI 配置 section

### Step 9: E2E 验证 + Commit

---

## 十一、不在 scope

- Settings 以外的 AI 功能（生成管道、SSE 等 — 后续 task）
- 前端 `useAiGenerate()` composable
- `AiGenerateBar.vue` 组件
- Prompt 文件 / tools / agents 实现

---

## 十二、关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 配置存储位置 | `config.json`（cwd 或 Electron userData） | 单一真相来源，env 仅做覆盖 |
| 文件写安全 | 备份 + 原子写（tmp rename） | claude-code 启发，防损坏；不到 20 行 |
| 文件读写 | 通用 `saveConfigFile()` 在 config.ts | 未来其他 Settings 项也能复用 |
| API Key 展示 | password 字段 + 眼睛 toggle | 安全 + 可用性平衡 |
| API Key 更新逻辑 | 如果传入值含 `***` 则保留旧值 | 避免 masked 值覆盖真实 key |
| Provider 连通测试 | POST /test-provider → GET /models | 最小请求验证，10s 超时，不重试 |
| Provider 列表编辑 | 内联卡片编辑（非弹窗） | 操作流畅，信息密度高；对齐 cherry-studio 风格 |
| 前端状态 | 本地 ref/reactive，非 Pinia | 配置仅 Settings 页面使用，不需要全局 store |
