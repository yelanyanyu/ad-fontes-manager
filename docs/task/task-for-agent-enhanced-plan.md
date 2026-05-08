# Implementation Plan: AI Generate 增强

> **状态**: 计划阶段
> **来源**: grill-me session (2026-05-08)
> **关联**: `task-for-agent-enhanced.md`

---

## 模块划分

### 模块 A: Prompt Files（提示词拆分）

| 文件 | 操作 |
|------|------|
| `docs/prompts/english-structural.md` | 新建 — searching 阶段结构字段 |
| `docs/prompts/english-creative.md` | 新建 — pondering 阶段创意字段 |
| `docs/prompts/de-structural.md` | 新建 — 德语 searching |
| `docs/prompts/de-creative.md` | 新建 — 德语 pondering |
| `docs/prompts/english-generation.md` | **删除** |

### 模块 B: Types & Utils（基础类型和工具）

| 文件 | 操作 |
|------|------|
| `src/server/services/ai/types.ts` | 扩展 `PipelineProgressEvent`（+tool-call/result），`StepResult`（+rawText/toolCalls），修正 `outputParser` 签名 |
| `src/server/services/ai/utils.ts` | **新建** — `deepMerge()` |
| `src/server/services/ai/tools/adapter.ts` | **新建** — `toAISdkTool()` + `createToolRegistry()` |
| `src/server/services/ai/tools/reasoning.ts` | **新建** — `buildReasoningParams()` |

### 模块 C: Pipeline Core（管道核心）

| 文件 | 操作 |
|------|------|
| `src/server/services/ai/pipe.ts` | `buildPrompt()` 改用 `stage.systemPromptFile`；`runStageText()` 参数对象化 + 接入 tools/reasoning；mock 拆分为 `buildStructuralMock()` + `buildCreativeMock()` |
| `src/server/services/ai/definitions/english.ts` | 阶段 id 重命名 + modelKey 分配 + promptFile 更新 |
| `src/server/services/ai/definitions/german.ts` | **新建** — 德语管道定义 |
| `src/server/services/ai/agents/enrichment.ts` | 解析逻辑改为返回创意字段对象（deepMerge 交给 runner） |
| `src/server/services/ai/modelResolver.ts` | 返回 `reasoningEffort` 字段 |

### 模块 D: Schema（配置 Schema）

| 文件 | 操作 |
|------|------|
| `src/server/schemas/aiConfig.ts` | `AIStageConfigSchema` 新增 `reasoningEffort` 字段 |

### 模块 E: Controller（控制器）

| 文件 | 操作 |
|------|------|
| `src/server/controllers/generateController.ts` | `fromStage` 参数；tool 事件广播；`selectPipeline()` 支持德语；`rawText` 存储 |

### 模块 F: Settings UI（设置界面）

| 文件 | 操作 |
|------|------|
| `src/renderer/src/views/SettingsView.vue` | 每阶段卡片新增 `reasoningEffort` 下拉 |

### 模块 G: Composable（前端状态管理）

| 文件 | 操作 |
|------|------|
| `src/renderer/src/composables/useAiGenerate.ts` | `StepState` 新字段；tool-call/result SSE 事件；`rawText` 存储 |

### 模块 H: Drawer Components（抽屉组件）

| 文件 | 操作 |
|------|------|
| `src/renderer/src/components/AiGenerate/AiGenerateDrawer.vue` | **新建** — Drawer 主体 |
| `src/renderer/src/components/AiGenerate/AiGenerateStagePanel.vue` | **新建** — 侧面板 |
| `src/renderer/src/views/HomeView.vue` | 集成 Drawer 组件 |
| `src/renderer/src/components/WordEditor/WordEditor.vue` | 工具栏新增 "AI Generate" 按钮 |
| `src/renderer/src/components/AiGenerate/AiGenerateBar.vue` | **删除** |

### 实现顺序

```
A (Prompts) → B (Types & Utils) → C (Pipeline Core) → D (Schema)
    → E (Controller) → F (Settings UI) → G (Composable) → H (Drawer)
```

---

## 潜在问题与矛盾分析

### 问题 1 (CRITICAL): `outputParser` 签名不兼容

**现状**: `PipelineStage.outputParser` 类型为 `(text: string) => Partial<PipelineContext>`

**冲突**: 新设计中 `parseEnrichmentOutput` 需要访问 `previousContext.researchYaml` 来做 deepMerge，但调用方 `stage.outputParser(text)` 只传一个参数。

**推荐方案**: deepMerge 不在 parser 中做，改在 `SequentialRunner.run()` 中做。parser 只返回 `{ creativeYaml: text.trim() }` 这样的原始解析结果。Runner 在 `Object.assign(ctx, parsed)` 后用 `deepMerge` 手动合并 `researchYaml` 和 `creativeYaml` → `fullYaml`。

具体改动：
```ts
// enrichment.ts — parser 只做解析
function parseEnrichmentOutput(text: string): Partial<PipelineContext> {
  return { creativeYaml: text.trim() };
}

// pipe.ts — runner 做合并
const parsed = stage.outputParser ? stage.outputParser(text) : { fullYaml: text };
Object.assign(ctx, parsed);

// 在 enrichment 阶段后特殊处理
if (stage.id === 'pondering' && ctx.researchYaml && ctx.creativeYaml) {
  const structural = yaml.load(ctx.researchYaml);
  const creative = yaml.load(ctx.creativeYaml);
  ctx.fullYaml = yaml.dump(deepMerge(structural, creative), { lineWidth: -1, noRefs: true });
}
```

`PipelineContext` 新增 `creativeYaml?: string` 字段。

### 问题 2 (CRITICAL): Mock 路径与两阶段拆分冲突

**现状**: `buildWordYaml()` 一次性生成包含全部字段的完整 YAML，mock 路径直接返回，不触发 parser。

**冲突**: 拆分后 mock 也需要模拟两阶段：
- searching mock → 只生成结构性 YAML（到 `historical_origins`）
- pondering mock → 只生成创意字段 YAML
- auditing mock → 不变（评分 JSON）

**推荐方案**: 拆分 `buildWordYaml()` 为两个函数，`runStageText()` 在 mock 分支按 `stageId` 选择：
```ts
if (model.isMock) {
  if (stageId === 'searching') return buildStructuralMock(ctx.word, ctx.language, ctx.context);
  if (stageId === 'pondering') return buildCreativeMock(ctx.word, ctx.language, ctx.context);
  if (stageId === 'auditing') return buildMockReview();
}
```

`PipelineContext` 的 mock 路径中，parser 仍需正常工作：`parseResearchOutput` → `researchYaml`，`parseEnrichmentOutput` → `creativeYaml`，runner 负责 deepMerge。

### 问题 3 (MEDIUM): 工具注册表缺失

**现状**: `PipelineStage.toolNames: string[]` 只是字符串数组，没有任何机制将名称解析为实际的工具对象。

**冲突**: `streamText()` 需要 `Record<string, Tool>` 参数。

**推荐方案**: 在模块 B 的 `adapter.ts` 中同时创建工具注册表：
```ts
// adapter.ts
import { searchEtymologyTool } from './searchEtymology';
import { fetchPageTool } from './fetchPage';

const toolRegistry = new Map<string, ReturnType<typeof buildTool>>();
toolRegistry.set('search_etymology', searchEtymologyTool);
toolRegistry.set('fetch_page', fetchPageTool);

export function resolveTools(toolNames: string[]): Record<string, ReturnType<typeof tool>> {
  const tools: Record<string, unknown> = {};
  for (const name of toolNames) {
    const toolDef = toolRegistry.get(name);
    if (toolDef) tools[name] = toAISdkTool(toolDef);
  }
  return tools;
}
```

### 问题 4 (MEDIUM): `runStageText()` 参数爆炸

**现状**: 6 个位置参数 `(stageId, prompt, ctx, onChunk, externalSignal?, runLogger?)`

**冲突**: 新增 tools、reasoningParams、onToolCall、onToolResult 后变成 10 个参数。

**推荐方案**: 改为单个 options object：
```ts
interface RunStageTextOptions {
  stageId: string;
  prompt: string;
  ctx: PipelineContext;
  onChunk: (chunk: string) => void;
  onToolCall?: (event: ToolCallEvent) => void;
  onToolResult?: (event: ToolResultEvent) => void;
  externalSignal?: AbortSignal;
  runLogger?: Logger;
  tools?: Record<string, Tool>;
  reasoningParams?: Record<string, unknown>;
}
```

### 问题 5 (MEDIUM): `step:complete` 不携带 `rawText`

**现状**: `PipelineProgressEvent` 的 `step:complete` 类型为：
```ts
{ type: 'step:complete'; step: string; duration: number; summary: string; result?: unknown }
```

**冲突**: 前端侧面板需要 LLM 原始输出（rawText）来展示。

**推荐方案**: 扩展 `step:complete` 事件类型，新增 `rawText` 字段：
```ts
{
  type: 'step:complete';
  step: string;
  duration: number;
  summary: string;
  result?: unknown;
  rawText?: string;   // NEW
}
```

`SequentialRunner.run()` 中：`onProgress({ type: 'step:complete', ..., rawText: text })`。

`updateJobFromEvent` 中：`step.rawText = event.rawText`。

### 问题 6 (MEDIUM): Fix 阶段未纳入实现计划

**现状**: 当前管道没有格式校验阶段。`task-for-agent-enhanced.md` 描述了 Fix 阶段（Zod 校验 + fixer 重试最多 3 次）。

**冲突**: 实现计划中完全没有 Fix 的代码改动。

**推荐方案**: 两种处理方式：
- **方案 A**: 本次实现在 pondering 和 auditing 之间插入 Fix 阶段（`type: 'validate'`），依赖现有的 `retry` 配置
- **方案 B**: 本次不实现 Fix，在 pondering 的 `outputParser` 后做一层 Zod 校验，失败则报错（无自动修复）

建议选择方案 B 作为 MVP，Fix 延后到从阶段可选开关一起实现。需要更新 task-for-agent-enhanced.md 以反映这一点。

### 问题 7 (MEDIUM): 德语管道定义缺失

**现状**: `definitions/` 只有 `english.ts`，`selectPipeline()` 硬编码返回 `englishPipeline`。

**冲突**: 模块 A 创建了 `de-structural.md` 和 `de-creative.md`，但没有德国管道定义来使用它们。

**推荐方案**: 新建 `definitions/german.ts`，与 `english.ts` 结构相同，`systemPromptFile` 指向德语文件。`selectPipeline()` 改为按 language 返回：
```ts
function selectPipeline(language: string): PipelineDefinition {
  if (language === 'de') return germanPipeline;
  return englishPipeline;
}
```

### 问题 8 (LOW): `balanced` modelKey 成为死代码

**现状**: 三级 `fast | balanced | expert`。

**冲突**: 新配置只有 fast (searching) 和 expert (pondering + auditing)，`balanced` 不再被任何阶段引用。

**推荐方案**: 保留不删。理由：
- Settings UI 仍有三级配置界面（用户可能在其他场景用到）
- `modelResolver.ts` 仍接受 `balanced`
- 日后可能新增中间阶段（如 Fix 阶段用 balanced）
- 删除反而增加 breaking change

### 问题 9 (LOW): Composable 生命周期与路由导航

**现状**: `useAiGenerate` 在 `onUnmounted` 中关闭所有 SSE 连接。

**冲突**: composable 挂在 Drawer 组件 → Drawer 是 HomeView 子组件 → 用户导航离开 HomeView → composable unmount → SSE 断开 → running jobs 丢失。

**推荐方案**: 暂不处理。理由：
- 当前只有 HomeView 一个主路由，用户不会导航离开
- 未来加 `/generate` 路由时，将 composable 提升到 App 层（provide/inject）
- 在 task-for-agent-enhanced.md 中标注为已知限制

### 问题 10 (LOW): Drawer 关闭/重开时的 SSE 重连

**现状**: SSE 连接在 `subscribeToJob()` 时建立，`unsubscribeJob()` 时断开。

**冲突**: Drawer 关闭（隐藏）vs 销毁（v-if unmount）vs 重开时的状态差异：
- 如果 drawer 用 `v-show`（隐藏），SSE 保持连接，状态完好 → ✓
- 如果 drawer 用 `v-if`（销毁），SSE 断开，重开需重连并重放已完成事件

**推荐方案**: Drawer 用 `v-show`，确保 SSE 不会因 UI 隐藏而断开。即使 drawer 关闭，job 仍在后台运行，toast 通知完成后用户重开即可查看。

---

## 修正后的实现步骤

### 模块 A: Prompt Files

1. 创建 `docs/prompts/english-structural.md`
2. 创建 `docs/prompts/english-creative.md`
3. 创建 `docs/prompts/de-structural.md`
4. 创建 `docs/prompts/de-creative.md`
5. 删除 `docs/prompts/english-generation.md`

### 模块 B: Types & Utils

6. 扩展 `types.ts`：
   - `PipelineProgressEvent` 新增 `step:tool-call`、`step:tool-result`
   - `step:complete` 新增 `rawText?: string`
   - `StepResult` 新增 `rawText?: string`、`toolCalls?: ToolCallRecord[]`
   - `PipelineContext` 新增 `creativeYaml?: string`
   - （`outputParser` 签名不变，deepMerge 在 runner 中做）

7. 新建 `utils.ts` — `deepMerge()`

8. 新建 `tools/adapter.ts` — `toAISdkTool()` + `resolveTools()`

9. 新建 `tools/reasoning.ts` — `buildReasoningParams()`

### 模块 C: Pipeline Core

10. 重构 `pipe.ts`：
    - `buildPrompt()` 改用 `stage.systemPromptFile`
    - `runStageText()` 改为 options object 参数
    - 接入 tools（`resolveTools(stage.toolNames)`）
    - 接入 reasoningParams（`buildReasoningParams(model.provider, model.reasoningEffort)`）
    - 新增 tool-call/tool-result 流处理
    - 拆分 mock 函数（`buildStructuralMock` + `buildCreativeMock`）
    - `SequentialRunner.run()` 在 pondering 阶段后执行 deepMerge

11. 更新 `definitions/english.ts` — 阶段 id/modelKey/promptFile

12. 新建 `definitions/german.ts` — 德语管道定义

13. 更新 `agents/enrichment.ts` — 返回 `{ creativeYaml }`，不做 deepMerge

14. 更新 `modelResolver.ts` — 返回 `reasoningEffort`

### 模块 D: Schema

15. 更新 `schemas/aiConfig.ts` — `AIStageConfigSchema` 新增 `reasoningEffort`

### 模块 E: Controller

16. 更新 `generateController.ts`：
    - `selectPipeline()` 支持德语
    - `handleResumeJob()` 接受 `body.fromStage`
    - `updateJobFromEvent()` 处理 tool 事件和 rawText
    - `broadcast()` 支持新事件类型

### 模块 F: Settings UI

17. 更新 `SettingsView.vue` — 每阶段 reasoningEffort 下拉

### 模块 G: Composable

18. 更新 `useAiGenerate.ts`：
    - `StepState` 新增 `rawText`、`toolCalls`
    - 监听 `step:tool-call`、`step:tool-result` SSE 事件
    - `step:complete` 保存 `rawText`
    - `JobState` 新增队列相关字段（`queuePosition`、`status: 'queued'` 等）

### 模块 H: Drawer

19. 新建 `AiGenerateDrawer.vue`
20. 新建 `AiGenerateStagePanel.vue`
21. 更新 `HomeView.vue` — 集成 Drawer（`v-show`，非 `v-if`）
22. 更新 `WordEditor.vue` — 工具栏加 "AI Generate" 按钮
23. 删除 `AiGenerateBar.vue`

---

## 验证清单

1. `npm run type-check` — 无错误
2. `npm run lint` — 无错误
3. `npm run test` — 已有测试通过
4. 手动测试：输入单词 → drawer 弹出 → 3 阶段流式运行 → 评分 → Fill Editor
5. 手动测试：关闭 drawer (v-show) → toast 通知 → 重开查看结果
6. 手动测试：fromStage Regenerate（选择 pondering → 仅重跑创意字段）
7. 手动测试：搜索 API 不可用 → 降级纯 LLM + warning
8. 手动测试：Settings 修改 reasoningEffort → 生成生效
9. 手动测试：mock 模式（无配置时）跑通完整流程
