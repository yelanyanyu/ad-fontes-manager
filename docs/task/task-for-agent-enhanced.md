# Task: AI Generate 增强方案

> **状态**: 计划阶段
> **来源**: grill-me session (2026-05-08)
> **优先级**: P2

---

## 一、目标

将单词语法生成 Pipeline 从"一阶段全量生成"重构为"多阶段分工协作"，同时提升 UI/UX 体验。

---

## 二、核心设计决策

| # | 决策 | 结论 |
|---|------|------|
| 1 | 提示词拆分 | 两个独立文件（searching 用 structural，pondering 用 creative） |
| 2 | 字段边界 | Pass 1 止于 `historical_origins`；Pass 2 从 `visual_imagery_zh` 开始 |
| 3 | 拼接方式 | runner 中 deepMerge（`researchYaml` + `creativeYaml` → `fullYaml`），不在 parser 中合并 |
| 4 | modelKey 分配 | searching→fast(默认auto), pondering→expert(默认high), auditing→expert(默认high) |
| 5 | 阶段命名 | searching / pondering / auditing |
| 6 | 工具集成 | Vercel AI SDK 原生 `tool()` + `toAISdkTool()` 适配 + `resolveTools()` 注册表 |
| 7 | 搜索降级 | API 不可用时降级为纯 LLM，前端标记 warning |
| 8 | 重跑 | `POST /resume` 接受 `fromStage`，用户可选从任意阶段开始 |
| 9 | 思考深度 | 新增 `reasoningEffort`，参考 cherry-studio 按 provider 转换参数 |
| 10 | UI 方案 | AiGenerateBar → Drawer（右侧滑出，`v-show` 控制显隐） |
| 11 | 队列 | 单字队列（job 运行时新词排队），非批量 |
| 12 | Fix 阶段 | MVP 不自动修复；pondering 后做 Zod 校验，失败即报错。Fix 延后到阶段开关一起实现 |
| 13 | 阶段可选开关 | 延后（searching/fix/auditing 可 toggle，pondering 必选） |
| 14 | 词列表触发 | 延后（配合智能优化已有单词功能） |
| 15 | 批量生成 | 延后（见 `task_plan_phase2.md`） |

---

## 三、两阶段 YAML 生成

### Pass 1 — searching (fast 模型)

**需要工具**: `search_etymology` (Brave Search API) + `fetch_page` (cheerio 网页抓取)

**输出（仅结构性字段）**:
```yaml
yield:
  user_word: "..."
  lemma: "..."
  syllabification: "..."
  user_context_sentence: "..."
  part_of_speech: "..."
  contextual_meaning:
    en: "..."
    zh: "..."
  other_common_meanings:
    - "..."
  language: "en"

etymology:
  root_and_affixes:
    prefix: "..."
    root: "..."
    suffix: "..."
    structure_analysis: "..."
  historical_origins:
    history_myth: "..."
    source_word: "..."
    pie_root: "..."
```

### Pass 2 — pondering (expert 模型)

**无需工具**。接收 Pass 1 输出（`researchYaml`）作为上下文。

**输出（仅创意字段）**:
```yaml
etymology:
  visual_imagery_zh: |
    ...
  meaning_evolution_zh: |
    ...

cognate_family:
  cognates:
    - word: "..."
      logic: "..."

application:
  selected_examples:
    - type: "Literal / Root Image"
      sentence: "..."
      translation_zh: "..."
    - type: "Current Context"
      sentence: "..."
      translation_zh: "..."
    - type: "Abstract / Metaphorical"
      sentence: "..."
      translation_zh: "..."

nuance:
  image_differentiation_zh: |
    ...
  synonyms:
    - word: "..."
      meaning_zh: "..."
```

### 合并 (runner 中执行)

```
researchYaml (Pass 1)  →  yaml.load()
creativeYaml (Pass 2)  →  yaml.load()
    ↓                        ↓
    deepMerge() → fullYaml → yaml.dump()
    ↓
auditing 阶段评分 → 返回
```

**关键**: deepMerge 在 `SequentialRunner.run()` 中执行，不在 `parseEnrichmentOutput` 中。Parser 只返回 `{ creativeYaml: text }`。这避免了 `outputParser` 签名变更。

### Auditing (expert 模型)

- 接收合并后的完整 `fullYaml`
- 评分 3 个中文字段：`visual_imagery_zh`、`meaning_evolution_zh`、`image_differentiation_zh`
- 1-10 分制，输出 JSON

---

## 四、错误处理

| 场景 | 处理 |
|------|------|
| 搜索 API 不可用 | 降级到纯 LLM，tool result 带 `warning` 标记告知用户 |
| Rate Limit (429) | `classifyLLMError` 自动 1 次重试（2s 退避） |
| Provider 5xx | 自动 1 次重试（8s 退避） |
| Timeout | 不重试，直接失败 |
| 用户取消 | AbortController.abort()，标记 "User cancelled" |
| Zod 校验失败 (MVP) | 报错，不自动修复。日后加 Fix 阶段 |

---

## 五、思考深度

| 模型等级 | 默认 reasoningEffort |
|----------|---------------------|
| fast | `auto` |
| balanced | `auto` |
| expert | `high` |

Cherry-studio 参考：`none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `auto`。

Provider 转换：
- Anthropic → `thinking: { type: 'adaptive'|'enabled' }, effort: 'low'|'medium'|'high'|'max'`
- OpenAI → `reasoningEffort: 'minimal'|'low'|'medium'|'high'`
- 其他 provider → 透传 `reasoningEffort`

---

## 六、提示词文件

| 文件 | 用途 |
|------|------|
| `english-structural.md` (新) | searching — Role + Critical Rules + 结构性字段输出格式 |
| `english-creative.md` (新) | pondering — Role + Anti-AI Rules + 创意字段写作指南（从 `word-en2cn-yaml-long.md` 搬运，不含范例） |
| `de-structural.md` (新) | 德语 searching |
| `de-creative.md` (新) | 德语 pondering |
| `content-reviewer.md` | 不变（已只评 3 个中文字段） |
| `english-generation.md` | **删除** |
| `word-en2cn-yaml-long.md` | 保留为设计参考 |

---

## 七、UI 设计

### Drawer 布局

```
┌─ AI Generate Drawer ─────────────────────────────┐
│  [词输入框] [Context] [Notes]     [Generate] [Cancel] │
│                                                    │
│  ▶ searching ✓ (3.2s)                             │
│    ├ 🔧 search_etymology "en- prefix" ✓ (0.8s)    │
│    ├ 🔧 fetch_page etymonline.com ✓ (1.4s)        │
│    └ [点击查看原始输出]                              │
│  ▶ pondering ✓ (12.5s)                            │
│    └ [点击查看原始输出]                              │
│  ▶ auditing ✓ (1.2s)                              │
│    └ Score 7/10 · 2 pass, 1 fail                   │
│                                                    │
│  [查看完整 YAML]  [Fill Editor]  [Regenerate ▼]     │
└────────────────────────────────────────────────────┘
```

- 阶段 Collapse panel（运行中自动展开，完成后收起）
- 工具调用内联行（🔧 图标 + 名称 + 状态 + 耗时）
- 实时流式文本（pre 标签，等宽字体）
- 点击阶段 pill → 弹出 `AiGenerateStagePanel`（侧面板显示 LLM 原始输出）

### 交互流程

```
WordEditor 工具栏 "AI Generate" → Drawer 滑出
    → 输入词 → Generate
    → 3 阶段流式运行
    → 完成 → toast "生成完成，点击查看"
    → 用户查看评分 → 满意 Fill Editor / 不满意选阶段 Regenerate
```

### 状态处理

| 场景 | 行为 |
|------|------|
| Drawer 关闭（v-show） | SSE 保持连接，job 后台运行 |
| 生成期间收纳 drawer | toast 通知完成 |
| 排队中 | 显示 "Queued (position 1/3)" |
| 搜索降级 | tool-call 行黄色 warning 标记 |
| 阶段失败 | 红色标记 + 错误信息 + Retry 按钮 |

### 已知限制

- composable 挂载在 HomeView 层，路由导航离开会断开 SSE（当前仅 HomeView 一个路由，无实际影响）
- 日后加 `/generate` 路由时需提升 composable 到 App 层

---

## 八、队列

- `POST /v2/generate/single` → 无 job 运行则立即开始，有则排队
- 返回 `{ jobId, queued: boolean, position?: number }`
- 当前 job 完成 → 自动 dequeue → 启动下一个
- SSE 事件通知排队状态变化

---

## 九、配置变更

```jsonc
{
  "ai": {
    "stages": {
      "fast": {
        "provider": "deepseek",
        "model": "deepseek-chat",
        "reasoningEffort": "auto"   // NEW
      },
      "balanced": {
        "provider": "deepseek",
        "model": "deepseek-reasoner",
        "reasoningEffort": "auto"
      },
      "expert": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "reasoningEffort": "high"   // NEW
      }
    }
  }
}
```

---

## 十、文件变更概览

### 新建

| 文件 | 说明 |
|------|------|
| `docs/prompts/english-structural.md` | searching 提示词 |
| `docs/prompts/english-creative.md` | pondering 提示词 |
| `docs/prompts/de-structural.md` | 德语 searching 提示词 |
| `docs/prompts/de-creative.md` | 德语 pondering 提示词 |
| `src/server/services/ai/utils.ts` | `deepMerge()` |
| `src/server/services/ai/tools/adapter.ts` | `toAISdkTool()` + `resolveTools()` |
| `src/server/services/ai/tools/reasoning.ts` | `buildReasoningParams()` |
| `src/server/services/ai/definitions/german.ts` | 德语管道定义 |
| `src/renderer/src/components/AiGenerate/AiGenerateDrawer.vue` | Drawer 主体 |
| `src/renderer/src/components/AiGenerate/AiGenerateStagePanel.vue` | 阶段侧面板 |

### 修改

| 文件 | 改动 |
|------|------|
| `types.ts` | `PipelineProgressEvent` + tool-call/result；`step:complete` + rawText；`StepResult` + rawText/toolCalls；`PipelineContext` + creativeYaml |
| `pipe.ts` | `buildPrompt()` 改用 systemPromptFile；`runStageText()` options object；接入 tools/reasoning；mock 拆分；runner 中 deepMerge |
| `definitions/english.ts` | 阶段 id/modelKey/promptFile |
| `agents/enrichment.ts` | 返回 `{ creativeYaml }` |
| `modelResolver.ts` | 返回 `reasoningEffort` |
| `schemas/aiConfig.ts` | `AIStageConfigSchema` + reasoningEffort |
| `controllers/generateController.ts` | fromStage；tool 事件；rawText；selectPipeline 支持德语 |
| `useAiGenerate.ts` | StepState 新字段 + tool SSE 事件监听 |
| `SettingsView.vue` | reasoningEffort 下拉 |
| `HomeView.vue` | 集成 AiGenerateDrawer |
| `WordEditor.vue` | 工具栏 "AI Generate" 按钮 |

### 删除

| 文件 | 原因 |
|------|------|
| `docs/prompts/english-generation.md` | 拆分为 structural + creative |
| `AiGenerateBar.vue` | 替换为 Drawer |
