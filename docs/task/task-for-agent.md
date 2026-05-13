# Task: Prompt 缓存优化 — 静态/动态分离，降低批量生成 token 消耗

> **状态**: 第一阶段（prompt 文件修改）已完成

---

## 目标

将多个 AI pipeline stage 的 prompt 拆分为静态和动态两部分：
- **静态**（Rules + Schema）→ system prompt，利用 DeepSeek API 自动前缀缓存在批量场景命中
- **动态**（数据）→ user message

涉及 stage：format-fixing（新增）、auditing（content-reviewer）、fixing（content-fixer）。
不涉及：searching、pondering（静态内容太少，收益低）。

同步提取 prompt 组装逻辑到独立模块，降低 `pipe.ts` 耦合度。

**核心原理**：DeepSeek API 对连续请求的字节级前缀做自动缓存。system prompt 完全不变 → 批量时第 1 次 cold，后续全部命中。动态数据放 user message 不破坏缓存。

---

## 一、哪些 stage 值得优化

| Stage | Prompt 文件 | 静态体量 | 动态数据 | 缓存收益 | 是否纳入 |
|-------|-----------|---------|---------|---------|---------|
| format-fixing | format-fixer.md + Schema | ~75 行 | yaml, errors | **高** | 是 |
| auditing | content-reviewer.md | ~130 行 | yaml, notes, userScore | **高** | 是 |
| fixing | content-fixer.md | ~40 行 | yaml, revisionNotes | **中** | 是 |
| searching | english-structural.md / de-structural.md | ~25 行 | word, context, notes, searchSummary | **低** | 否 |
| pondering | english-creative.md / de-creative.md | ~110 行 | word, context, notes, researchYaml | **中** | 是 |

---

## 二、核心决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Prompt 文件结构 | `# User Message` 分隔 system 和 user 段 | 一个文件自包含，prompt 作者可同步维护两端 |
| 变量注入 | 统一 `{{}}` 注入，包括 `{{schema}}` | 不搞特殊拼接逻辑，assembler 逻辑统一 |
| Schema 文件引用 | `PipelineStage.schemaFile` → assembler 加载后注入为 `{{schema}}` | 跟其他变量一样对待 |
| Schema 文件格式 | YAML 模板嵌入 Markdown，占位说明，无范例无写作规则 | LLM 对 YAML 模板理解准确 |
| Schema 拆分 | English + German 两个文件 | 结构差异大 |
| Prompt 组装 | 新文件 `prompts/assembler.ts` | `pipe.ts` 不再关心变量字典和模板注入 |
| Stage 架构 | 不合并 | 错误隔离、Stop-loss、中间产物可检查 |
| structural prompt | 不动 | 静态太少，`searchSummary` 每次不同 |
| creative prompt | 纳入 | `researchYaml` 每次不同——正因如此才需要拆分。静态体量 ~110 行，批量 pondering 收益明显 |

---

## 三、架构变更

```
当前:
  pipe.ts buildPrompt() → loader.ts loadSystemPrompt() → 变量注入到 system prompt
  runStageText() 硬编码 user message: "Generate the ... output for ..."

改为:
  pipe.ts → assembler.ts assemblePrompt() → { system, user }
  runStageText() 接收 { system, user }
```

### assembler.ts 职责

1. 从 PipelineContext 构建变量字典（含 `schema`——若 `stage.schemaFile` 存在则加载）
2. 加载 prompt 文件，按 `# User Message` 拆分为 system 段和 user 段
3. system = `loadSystemPrompt` 对 system 段注入变量（仅 `{{schema}}` 等在 system 段出现）
4. user = `loadSystemPrompt` 对 user 段注入变量（`{{yaml}}`、`{{errors}}` 等）
5. 若 prompt 文件不含 `# User Message`（现有 stage），system = 全文注入变量，user = 固定短句

### 各 stage 的 system/user 拆分

**format-fixing**（format-fixer.md）：
```
system: Role → {{schema}}（注入 Schema 文件内容）→ 8 条 Critical Rules
user:   修复以下 YAML 的结构错误：
       {{yaml}}（注入待修复 YAML）
       验证错误：
       {{errors}}
```

**auditing**（content-reviewer.md）：
```
system: Role → Fields to Review → 评分公式 → Anti-AI Style Flags → Output Format
user:   待审核 YAML：
       {{yaml}}
       用户备注：{{notes}}
       用户评分：{{userScore}}
```

**fixing**（content-fixer.md）：
```
system: Role → 6 条 Critical Rules → 8 条 Anti-AI Style Rules → Output Format
user:   根据以下修改意见修复 YAML：
       {{yaml}}
       修改意见：
       {{revisionNotes}}
```

**pondering**（english-creative.md / de-creative.md）：
```
system: Role → Critical Rules → Anti-AI Style Rules → Output Format（含 YAML 模板 + 写作说明）
user:   基于以下结构研究 YAML 生成创意字段：
       {{word}} / {{language}} / {{context}} / {{notes}}
       {{researchYaml}}
```

---

## 四、第一阶段：修改 Prompt 文件（已完成）

### 4.1 新建 English Schema

文件：`docs/prompts/schemas/english-schema.md`

从 `word-en2cn-yaml-long.md` 提取 YAML 模板，去掉写作规则、范例。纯 YAML 骨架 + 占位说明，约 55 行。

### 4.2 新建 German Schema

文件：`docs/prompts/schemas/de-schema.md`

从 `word-de2cn-yaml.md` 提取。约 65 行。

### 4.3 修改 format-fixer.md

删除 English Schema Reference，改为 `{{schema}}` 占位。末尾加 `# User Message` 段。约 30 行。

### 4.4 修改 content-reviewer.md

删除 `{{yaml}}`/`{{notes}}`/`{{userScore}}` 输入块，末尾加 `# User Message` 段。约 140 行。

### 4.5 修改 content-fixer.md

删除 `{{yaml}}`/`{{revisionNotes}}` 输入块，末尾加 `# User Message` 段。约 65 行。

### 4.6 修改 english-creative.md 和 de-creative.md

删除 Input 段（`{{word}}`/`{{context}}`/`{{notes}}`/`{{researchYaml}}`），末尾加 `# User Message` 段。各约 120 行。

---

## 五、第二阶段：修改代码

### 5.1 `PipelineStage` 类型加字段

一个可选字段：
- `schemaFile?: string` — 指向 `docs/prompts/schemas/` 下的 schema 文件。assembler 加载后作为 `{{schema}}` 变量注入

### 5.2 loader.ts 加 `loadSchema()`

与 `getPrompt` 类似（走同一缓存），路径解析到 `docs/prompts/schemas/`，返回原始内容。

### 5.3 新建 `prompts/assembler.ts`

导出 `assemblePrompt(stage, ctx): { system: string; user: string }`。

实现要点：
- 从 ctx 构建全部变量字典。若 `stage.schemaFile` 存在 → `vars.schema = loadSchema(stage.schemaFile)`
- 加载 prompt 文件，按 `# User Message` 拆分
- 若含分隔符：system = 前半段注入变量，user = 后半段注入变量
- 若不含（现有 stage）：system = 全文注入变量，user = `"Generate the ${stage.id} output for "${ctx.word}".`

### 5.4 修改 pipe.ts

- 删除 `buildPrompt` 函数
- 引入 `assemblePrompt`
- `RunStageTextOptions.prompt` 类型从 `string` 改为 `{ system: string; user: string }`
- `runStageText` 内：`system: prompt.system`，`prompt: prompt.user`
- 所有调用点：`prompt: buildPrompt(stage, ctx)` → `prompt: assemblePrompt(stage, ctx)`

### 5.5 更新 pipeline definitions

format-fixing stage（新建 definition 时）加 `schemaFile: 'english-schema.md'`（或 `de-schema.md`）。

现有 auditing / fixing stage 无需修改——assembler 自动检测 `# User Message` 分隔符。

---

## 六、不在本次 scope

- structural prompt — 静态太少，`searchSummary` 每次不同
- `field-regeneration.md` 的重启
- Anthropic 显式 `cache_control` 断点
