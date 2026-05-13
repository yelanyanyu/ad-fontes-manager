# Task: Prompt 缓存优化 — format-fixer 静态 Schema 拆分

> **状态**: 设计完成，待实现

---

## 目标

将 YAML Schema 从 format-fixer prompt 中拆出为独立文件，使其成为纯静态 system prompt，利用 DeepSeek API 的自动前缀缓存减少批量修复时的 token 消耗。同步提取 prompt 组装逻辑到独立模块，降低 `pipe.ts` 耦合度。

**核心原理**：DeepSeek API 对连续请求的字节级前缀做自动缓存。若 system prompt 完全不变，批量处理时只有第 1 次请求 cold，后续全部命中（~90% 折扣）。动态数据（待修复 YAML + errors）放 user message 不破坏缓存。

---

## 一、核心决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Schema 文件格式 | YAML 模板嵌入 Markdown，占位说明，无写作规则，无范例 | LLM 对 YAML 模板理解准确 |
| Schema 拆分 | English + German 两个文件 | 结构差异大（`root_and_affixes` vs `morphological_analysis`），分开缓存命中率更高 |
| format-fixer 发送模式 | 静态（Schema + Rules）→ system，动态（待修复 YAML + errors）→ user | 静态部分完整缓存命中，只有动态部分每次付费 |
| 变量注入控制 | `PipelineStage` 加 `injectTarget: 'system' \| 'user'` | 默认 `'system'`，向后兼容现有 stage |
| Schema 文件引用 | `PipelineStage` 加 `schemaFile` 字段 | assembler 在构建时自动拼接 |
| Prompt 组装 | 新文件 `prompts/assembler.ts` | `pipe.ts` 不再关心变量字典和模板注入 |
| Stage 架构 | 不合并 | 错误隔离、Stop-loss、中间产物可检查 |
| creative prompt | 本次不动 | 其 Output Format 含写作规则，定位不同 |

---

## 二、架构变更

```
当前:
  pipe.ts buildPrompt() → loader.ts loadSystemPrompt() → 变量注入到 system prompt
  runStageText() 硬编码 user message: "Generate the ... output for ..."

改为:
  pipe.ts → assembler.ts assemblePrompt() → { system, user }
  runStageText() 接收 { system, user }
```

### assembler.ts 职责

1. 从 PipelineContext 构建变量字典
2. 加载 prompt 文件 + 可选 schema 文件拼接
3. 根据 `injectTarget` 决定变量注入到 system 还是 user
4. 返回 `{ system: string; user: string }`

### 缓存原理

```
system prompt: [Schema.md (不变)] + [Rules (不变)] → 每次完整缓存命中
user message:  [待修复 YAML (变)] + [errors (变)] → 每次付费
```

批量修复场景：200 个词，第 1 次 cold，后 199 次 system prompt 完整缓存命中，节省 ~38% token。

---

## 三、第一阶段：修改 Prompt 文件

### 3.1 新建 English Schema

从 `word-en2cn-yaml-long.md` 的 Output Format 部分提取 YAML 模板。保留占位说明（如 `"(Lemma of the word)"`），**去掉**：
- `visual_imagery_zh` 的 6 条写作规则 → 只保留 `|` 和一行简短占位
- 范例（"母亲走后第七天..."）
- `meaning_evolution_zh` 的写作规则 → 只保留 `|` 和简短占位
- `cognate_family.instruction` → 去掉 instruction，只保留 cognates 数组结构
- `image_differentiation_zh` 的写作规则 → 只保留 `|` 和简短占位

最终：纯 YAML 骨架 + 每个字段一行占位说明，约 50 行。

### 3.2 新建 German Schema

同上逻辑，从 `word-de2cn-yaml.md` 提取。German 结构差异：
- `etymology` 下用 `morphological_analysis` 而非 `root_and_affixes`
- `morphological_analysis.components` 含 `element`、`type`、`de_meaning`、`trennbar`
- `yield` 含 `genus`、`kasus`
- `nuance.synonyms` 含 `connotation_difference`

### 3.3 修改 format-fixer prompt

删除 English Schema Reference 部分（当前第 32-44 行）。只保留 Role 声明 + `{{yaml}}`/`{{errors}}` 输入 + 8 条 Critical Rules。最终约 20 行。

注意：`{{yaml}}` 和 `{{errors}}` 占位符保留在文件中，由 assembler 根据 `injectTarget: 'user'` 决定注入位置。

---

## 四、第二阶段：修改代码

### 4.1 `PipelineStage` 类型加字段

两个可选字段：
- `schemaFile?: string` — 可选 YAML schema 文件路径，assembler 在构建时拼接到 system prompt 前面
- `injectTarget?: 'system' | 'user'` — 变量注入目标，默认 `'system'`

### 4.2 loader.ts 加 `loadSchema()`

与 `getPrompt` 类似（走同一缓存），但：
- 文件路径解析到 `docs/prompts/schemas/`
- 返回原始内容，不调用 `injectVariables`（Schema 无变量）

### 4.3 新建 `prompts/assembler.ts`

导出 `assemblePrompt(stage, ctx): { system: string; user: string }`。

实现要点：
- 从 ctx 构建全部变量字典（同现有 `buildPrompt` 逻辑）
- 若 `stage.schemaFile` 存在 → 加载 Schema 文本，拼接到 system prompt 前面
- 若 `injectTarget === 'user'`：system 用空变量渲染（Schema + Rules 保持静态），user 注入 `{{yaml}}`、`{{errors}}` 等动态变量
- 否则（默认）：system 注入所有变量，user 用固定短句 `"Generate the ${stage.id} output for "${ctx.word}".`

### 4.4 修改 pipe.ts

- 删除 `buildPrompt` 函数
- 引入 `assemblePrompt`
- `RunStageTextOptions.prompt` 类型从 `string` 改为 `{ system: string; user: string }`
- `runStageText` 内：`system: prompt.system`，`prompt: prompt.user`
- 所有调用点：`prompt: buildPrompt(stage, ctx)` → `prompt: assemblePrompt(stage, ctx)`
- 现有错误处理和解析逻辑不变

---

## 五、不在本次 scope

- creative prompt 的 Schema 拆分——其 Output Format 含写作规则，定位不同
- content-reviewer / content-fixer 的修改
- field-regeneration prompt 的重启（虽能复用 Schema，属后续任务）
- Anthropic 显式 `cache_control` 断点——当前 DeepSeek 自动前缀缓存已满足需求
