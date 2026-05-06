# Task: AI 单词语法生成 — 最小可行性验证

> **状态**: 设计完成，待实现
> **关联**: `docs/task/task_plan_phase2.md`（完整计划）

---

## 目标

在 Home 页面的 YAML Editor 模块中嵌入 AI 生成模块，跑通单单词 Research → Enrichment → Review 管道。SSE 实时推送进度。一切从简但架构正确——`PipelineDefinition` + `PipelineRunner` 接口为完整计划保留清晰扩展点。

---

## 一、核心决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| LLM 调用位置 | Server-side | API Key 不泄露到客户端 |
| LLM SDK | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | `generateText()` 统一接口：tool calling、streaming、structured output |
| 工作流编排 | 手写 `SequentialRunner` (implements `PipelineRunner`) | 本次 3 步线性管道，Mastra 过度抽象；完整计划时可换 `MastraRunner` 实现 |
| 进度推送 | SSE (Server-Sent Events) | 实时展示每步状态；完整计划技术选型复用 |
| Pipeline 抽象 | `PipelineDefinition` + `PipelineRunner` 接口 | 德语/批量/条件分支只需新 Definition 或新 Runner |
| 配置持久化 | Zod schema + config.json + env override | 对齐 Phase 2 计划的 config 结构 |
| Model 解析 | `modelResolver.ts` 集中管理 | 3 个 agent 统一调用，避免 config 访问散落各处 |
| UI 架构 | `<AiGenerateBar>` 组件 + `useAiGenerate()` composable | 渲染与逻辑分离；composable 可在未来批量模式中复用 |
| Prompt 文件 | 先 mock，后替换 | 本次验证用 hello 文本测试连通性；用户后续提供完整 prompt |

---

## 二、架构总览

```
                    ┌─ config.json + env ─┐
                    │   (Zod validated)   │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   modelResolver.ts  │  ← resolveModel(stageName) → {provider, apiKey, baseUrl, format}
                    └─────────┬───────────┘
                              │
  POST /api/v2/generate/single│
    ┌─────────────────────────▼───────────────────────────┐
    │              generateController.ts                  │
    │  1. validate input (Zod)                            │
    │  2. create jobId                                    │
    │  3. select PipelineDefinition by language           │
    │  4. launch SequentialRunner.run(definition, input)  │
    └─────────────────────────┬───────────────────────────┘
                              │
    ┌─────────────────────────▼───────────────────────────┐
    │              pipe.ts (SequentialRunner)             │
    │  implements PipelineRunner                          │
    │                                                     │
    │  for each stage in definition.stages:               │
    │    resolveModel(stage.modelKey)                     │
    │    create provider (openai/anthropic)               │
    │    load systemPrompt + inject variables             │
    │    generateText({model, prompt, tools?})            │
    │    emit SSE: step:start → step:complete             │
    │  emit SSE: pipeline:complete                        │
    └─────────────────────────┬───────────────────────────┘
                              │ SSE
    ┌─────────────────────────▼───────────────────────────┐
    │              useAiGenerate.ts (composable)          │
    │  EventSource → update reactive job state            │
    └─────────────────────────┬───────────────────────────┘
                              │
    ┌─────────────────────────▼───────────────────────────┐
    │              AiGenerateBar.vue (rendering)          │
    │  Idle → Running(collapsed) → Running(expanded)     │
    │  → Complete(expanded)                              │
    └─────────────────────────────────────────────────────┘
```

---

## 三、管道定义

```
POST /api/v2/generate/single
{
  word: string,
  context?: string,
  language: 'en' | 'de',
  notes?: string
}
  │
  ▼
[Research] researchAgent
  模型: config.stages.research (轻量，默认 openai/gpt-4o-mini)
  Tools: searchEtymology + fetchPage
  输入: word, context, language, notes
  输出: yield, root_and_affixes, historical_origins（不含 zh 创意字段）
  SSE: step:start → step:tokens(可选) → step:complete(含搜索摘要)
  │
  ▼
[Enrichment] enrichmentAgent
  模型: config.stages.enrichment (重量，默认 openai/gpt-4o)
  Tools: 无
  输入: Research 输出 + 搜索摘要
  输出: visual_imagery_zh, meaning_evolution_zh, cognate_family,
        application, nuance, image_differentiation_zh
  SSE: step:start → step:tokens(可选) → step:complete
  │
  ▼
[Review] reviewerAgent
  模型: config.stages.review (重量，默认 openai/gpt-4o)
  评分 3 字段: visual_imagery_zh, meaning_evolution_zh, image_differentiation_zh
  每个字段: 1-10 分 + 评价文字（正面/负面逐条列出）
  Zod outputSchema 约束输出 JSON
  SSE: step:start → step:complete(含评分+评价)
  │
  ▼
pipeline:complete → { yaml, scores, totalDuration }
  │
  ▼
用户审阅：
  - 查看 Reviewer 模型对每个字段的评分和评价
  - 修改评价 / 附加自己的补充说明
  - 决定："填入编辑器" / "重新生成"(带修改后的评价) / "手动编辑"
```

---

## 四、SSE 事件协议

| 事件 | 触发时机 | 携带数据 |
|------|---------|---------|
| `step:start` | Step 开始 | `{step: "research"|"enrichment"|"review", message: string}` |
| `step:tokens` | LLM 输出 token 流 (可选) | `{step, chunk: string}` |
| `step:complete` | Step 完成 | `{step, duration: number, summary: string, result?: object}` |
| `step:error` | Step 失败 | `{step, error: string, willRetry: boolean}` |
| `pipeline:complete` | 全部完成 | `{yaml: string, scores: object, totalDuration: number}` |

---

## 五、服务端文件结构

```
src/server/
├── schemas/
│   ├── aiConfig.ts              # AI 配置 Zod schemas
│   └── config.ts                # 扩展: 添加 ai 字段
├── utils/
│   ├── config.ts                # 扩展: ai config 读写 + getAIConfig() / getAPIKeyMasked()
│   └── logger.ts                # 扩展: loggers.ai
├── controllers/
│   └── generateController.ts    # 参数校验 + 调用 SequentialRunner + SSE 管理
├── services/ai/
│   ├── types.ts                 # PipelineDefinition, PipelineRunner, PipelineContext, StepResult
│   ├── modelResolver.ts         # resolveModel(stageName) → {provider, apiKey, baseUrl, format}
│   ├── pipe.ts                  # SequentialRunner implements PipelineRunner
│   ├── agents/
│   │   ├── research.ts          # research 阶段配置 (stage definition)
│   │   ├── enrichment.ts        # enrichment 阶段配置
│   │   └── reviewer.ts          # reviewer 阶段配置 + Zod output schema
│   ├── tools/
│   │   ├── buildTool.ts         # buildAITool() wrapper: 超时/重试/结构化错误/日志
│   │   ├── searchEtymology.ts   # Brave Search API tool
│   │   └── fetchPage.ts         # node-fetch + cheerio 抓取清洗
│   ├── prompts/
│   │   └── loader.ts            # 从 docs/prompts/ 加载 md + 模板变量注入
│   ├── definitions/
│   │   └── english.ts           # 英语 PipelineDefinition
│   └── routes/
│       └── generate.ts          # POST /generate/single + GET /:jobId/stream
└── app.ts                       # 扩展: 注册 generate routes
```

注意 controller 已移到 `src/server/controllers/` 下，与项目现有结构一致。

---

## 六、配置系统

### Schema 对齐 Phase 2 计划

```typescript
// src/server/schemas/aiConfig.ts
const AIProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  formats: z.array(z.enum(['openai', 'anthropic', 'google'])).min(1),
  models: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    formats: z.array(z.enum(['openai', 'anthropic', 'google'])).min(1),
  })).min(1),
});

const AISearchConfigSchema = z.object({
  provider: z.enum(['brave', 'tavily']),
  apiKey: z.string().min(1),
  autoDomains: z.boolean().default(false),
  domains: z.object({
    common: z.array(z.string()),
    en: z.array(z.string()).default([]),
    de: z.array(z.string()).default([]),
  }),
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
  }),
  review: z.object({
    threshold: z.number().min(1).max(10).default(6),
    thresholdByLanguage: z.record(z.number().min(1).max(10)).default({}),
  }).default({}),
});
```

### 读写方式

- `GET /api/v2/config/ai` → 返回脱敏配置（API Key 仅显示 `sk-***xxxx`）
- `PUT /api/v2/config/ai` → 保存配置到 `config.json`
- `.env` 可覆盖：`AI_SEARCH_API_KEY`、`AI_REVIEW_THRESHOLD` 等

---

## 七、modelResolver（集中模型解析）

```typescript
// src/server/services/ai/modelResolver.ts
interface ResolvedModel {
  provider: string;    // e.g. "openai"
  modelId: string;     // e.g. "gpt-4o-mini"
  apiKey: string;
  baseUrl: string;
  format: 'openai' | 'anthropic';  // determines which AI SDK provider to create
}

function resolveModel(stageName: 'research' | 'enrichment' | 'review'): ResolvedModel
```

3 个 agent 配置和 pipe.ts 统一从此获取模型信息，不再直接读 config。

---

## 八、前端组件设计

### AiGenerateBar.vue

嵌入 WordEditor.vue 顶部的可折叠 AI 面板组件。

**四种状态**：空闲（输入栏）/ 运行中收起（进度条）/ 运行中展开（步骤时间线）/ 完成展开（评分+操作）

**Props**: `onYamlReady: (yaml: string) => void`

**不含业务逻辑**——所有状态管理委托给 `useAiGenerate()` composable。

### useAiGenerate() Composable

批量感知的接口：`jobs: Map<jobId, JobState>`。单单词是 batchSize=1 的特例。核心方法：`startGeneration(params)` → `subscribeToJob(jobId)` → SSE → 更新 reactive state。

---

## 九、后端日志

`loggers.ai` (pino child)。每次管道调用创建 child logger：`{jobId, word, language}`。记录每步 start/complete/error 事件、耗时、token 数、搜索请求数。

---

## 十、依赖

```json
{
  "ai": "^5.x",
  "@ai-sdk/openai": "^2.x",
  "cheerio": "^1.x"
}
```

（`@ai-sdk/anthropic` 在后续支持 Anthropic 格式 provider 时再加；`@mastra/core` 在需要条件分支/重试管道时再加。）

---

## 十一、API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/v2/generate/single` | Body: `{word, context?, language, notes?}` → `{jobId}` |
| GET | `/api/v2/generate/:jobId/stream` | SSE: step:start / tokens / complete / error / pipeline:complete |
| GET | `/api/v2/config/ai` | 脱敏 AI 配置 |
| PUT | `/api/v2/config/ai` | 更新 AI 配置 |

---

## 十二、错误处理

| 错误类型 | 策略 |
|----------|------|
| Rate Limit (429) | 1 次重试，指数退避 2s→8s |
| Provider 5xx | 1 次重试，退避 2s |
| Zod 校验失败 | 返回错误信息给前端，用户手动修 |
| 搜索 API 失败 | 降级：无搜索结果，模型仅凭知识生成 |
| SSE 连接断开 | EventSource 自动重连；后端 jobId 保留状态 |

---

## 十三、Phase 2 迁移路径

当前最小实现和 Phase 2 完整计划之间，`PipelineRunner` 接口不变，变化都在实现层。

### 框架兼容性验证

Phase 2 完整管道：Pass1 → Format Check 1 → Fixer ⇄ retry → Pass2 → Format Check 2 → Fixer ⇄ retry → Review → Regenerator (条件) → 用户审核

| Phase 2 步骤 | 当前 Support | 迁移方式 |
|-------------|-------------|---------|
| Pass 1, Pass 2 | ✓ 已有 `type: 'llm'` | 不变 |
| Review | ✓ 已有 | 不变 |
| Format Check 1, 2 | ✗ | `PipelineStage.type: 'validate'` + `schemaName` —— 在 SequentialRunner 或 MastraRunner 内做 Zod 校验 |
| Fixer | ✗ | `PipelineStage.retry: {maxAttempts, fixerStageId}` —— Runner 在 validate 失败时自动触发 Fixer |
| Regenerator | ✗ | `PipelineStage.condition` 或 Mastra step 内部分支 |

所有扩展都是 `PipelineStage` 上加 optional 字段，不破坏现有 stage definition。

### 两条迁移路径

**路径 A — 扩展 SequentialRunner（适合简单场景）**
```
Phase 1: 3 stages, 纯顺序 → SequentialRunner (约 80 行)
Phase 2: 7 stages, 条件分支+retry → SequentialRunner 加 retry loop + condition (约 200 行)
```
- 优点：零新依赖，代码完全可控
- 缺点：复杂工作流逻辑手写，不如声明式清晰

**路径 B — 切换到 MastraRunner（适合复杂场景）**
```
Phase 1: 3 stages → SequentialRunner
Phase 2: 7 stages → MastraRunner implements PipelineRunner
```
- 优点：createStep 自带 Zod 校验（= Format Check），step 内 retry 语义清晰，DAG 编排声明式
- 缺点：引入 Mastra 依赖

**建议**：Phase 1 验证完后评估。如果 Fixer+Regenerator 的分支逻辑复杂，走路径 B；如果实际流程比计划的简单，走路径 A 省钱。

### 接口稳定性保证

Controller 只依赖接口：
```typescript
import { sequentialRunner } from '../services/ai/pipe';
// Phase 2 只需改 import：
// import { mastraRunner } from '../services/ai/MastraRunner';
```

前端 SSE 事件协议不变，`useAiGenerate()` composable 不变。

---

## 十四、不在本次 scope

- Fixer / Regenerator（格式修复/字段重生成 agent）
- 批量生成 / GenerateView 页面
- Settings UI 中的 AI 配置区块
- `step:tokens` 流式开关 UI（前缀预留，默认关闭）
- 德语管道（`PipelineDefinition` + `language` 字段已支持多语）
- Anki 集成
- Mastra workflow（`PipelineRunner` 接口已预留，后续换实现）
