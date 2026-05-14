# 硅基流动思考模式适配 + OpenAI 兼容厂商切换

## 背景

ad-fontes-manager 使用 Vercel AI SDK 调用 LLM。当前所有 `format: 'openai'` 的供应商（硅基流动、dashscope、aihubmix 等）均走 `@ai-sdk/openai` 包。该包专为 OpenAI 官方 API 设计，其 v3 版本对第三方厂商存在两个兼容性问题：

1. **默认端点**: `@ai-sdk/openai` v3 默认走 Responses API（`/responses`），第三方厂商只支持 Chat Completions（`/chat/completions`）→ 已临时修复为 `.chat()`
2. **推理参数**: 只发送 `reasoning_effort`，但硅基流动的 DeepSeek-V3.2 需要 `enable_thinking: true` 才能开启思考模式

Vercel 官方也意识到这个问题，发布了 `@ai-sdk/openai-compatible` 包专门给第三方厂商使用。Cherry Studio 已采用这个方案。

## 核心方案

```
model.format === 'openai'
  ├── api.openai.com → @ai-sdk/openai (保持不变)
  └── 第三方厂商     → @ai-sdk/openai-compatible (新增)

model.format === 'anthropic'
  └── 完全不受影响 → @ai-sdk/anthropic (保持不变)
```

## 改动清单

### 1. 安装新依赖

```bash
npm install @ai-sdk/openai-compatible
```

### 2. `src/server/services/ai/pipe.ts`

**文件头部新增 import**:

```typescript
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible') as typeof import('@ai-sdk/openai-compatible');
```

**修改 `createProvider` 函数**（约第 182-190 行）：

```typescript
function createProvider(model: ReturnType<typeof resolveModel>) {
  if (model.format === 'openai') {
    // OpenAI 官方 API 继续走 @ai-sdk/openai
    const isOfficialOpenAI = model.baseUrl?.includes('api.openai.com');
    if (isOfficialOpenAI) {
      return createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl }).chat(model.modelId);
    }
    // 第三方 OpenAI 兼容厂商（硅基流动等）走 @ai-sdk/openai-compatible
    return createOpenAICompatible({
      name: model.provider,
      apiKey: model.apiKey,
      baseURL: model.baseUrl,
    }).chatModel(model.modelId);
  }
  if (model.format === 'anthropic') {
    return createAnthropic({ apiKey: model.apiKey, baseURL: model.baseUrl })(model.modelId);
  }
  throw new Error(`Unsupported model format: ${model.format}`);
}
```

**关键点**:
- `.chatModel()` 而非 `.chat()` — `@ai-sdk/openai-compatible` 的 API 命名不同
- `name: model.provider` — 决定 `providerOptions` 的 key，如 `'silicon'`
- Anthropic 路径完全不改

### 3. `src/server/services/ai/tools/reasoning.ts`

**修改 `buildReasoningParams` 函数签名和逻辑**:

```typescript
export function buildReasoningParams(
  format: 'openai' | 'anthropic',
  effort: ReasoningEffort = 'auto',
  provider?: string  // 新增：供应商 ID，用于生成正确的 providerOptions key
): ReasoningResult {
  if (effort === 'auto' || effort === 'none') {
    return { providerOptions: {}, metadata: { effort, enabled: false } };
  }

  if (format === 'anthropic') {
    return {
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 16000 },
        } as unknown as Record<string, string | number | boolean | null>,
      },
      metadata: { effort, enabled: true },
    };
  }

  const openAIEffort = effort === 'xhigh' ? 'high' : effort;
  const providerKey = provider || 'openai';  // 未指定时默认 'openai'（兼容官方 OpenAI）

  // 硅基流动的 DeepSeek 等模型需要 enable_thinking 而非 reasoning_effort
  // 参见：https://docs.siliconflow.cn/api-reference/chat-completions/chat-completions
  if (provider === 'silicon') {
    return {
      providerOptions: {
        [providerKey]: {
          enable_thinking: true,
          thinking_budget: 16000,
        } as unknown as Record<string, string | number | boolean | null>,
      },
      metadata: { effort, enabled: true },
    };
  }

  return {
    providerOptions: {
      [providerKey]: { reasoningEffort: openAIEffort } as unknown as Record<
        string,
        string | number | boolean | null
      >,
    },
    metadata: { effort, enabled: true },
  };
}
```

**关键点**:
- 新增 `provider` 参数，用于生成正确的 `providerOptions` key
- 硅基流动特殊处理：使用 `enable_thinking: true` + `thinking_budget`
- 其他第三方厂商仍使用 `reasoningEffort`

### 4. `src/server/services/ai/pipe.ts` — 调用处

**第 269 行附近**，修改 `buildReasoningParams` 调用：

```typescript
// 原来：
const reasoningParams = buildReasoningParams(model.format, model.reasoningEffort);

// 改为：
const reasoningParams = buildReasoningParams(model.format, model.reasoningEffort, model.provider);
```

### 5. 测试更新

**`src/server/services/ai/pipe.test.ts`**:
- 已有回归测试验证 `.chat` 后缀（Provider ends with '.chat'）
- 对于 openai-compatible 厂商，provider 后缀改为 `.chat` 或 provider 名称
- 新增测试：验证 SiliconFlow 模式下 `enable_thinking` 参数正确传递

**`src/server/services/ai/tools/reasoning.test.ts`**（如果存在）:
- 新增测试：`buildReasoningParams('openai', 'high', 'silicon')` 返回 `enable_thinking: true`

### 6. 类型更新

**`src/server/services/ai/modelResolver.ts`** — 如果 `ResolvedModel` 类型需要调整：

`ResolvedModel` 已包含 `provider: string`，无需修改。

## 受影响范围

| 文件 | 改动程度 |
|------|----------|
| `package.json` | 新增 1 个依赖 |
| `pipe.ts` | 修改 `createProvider`（~10 行）、调用处（1 行） |
| `reasoning.ts` | 修改函数签名 + 新增硅基分支（~15 行） |
| `pipe.test.ts` | 新增 1 个测试、更新已有测试断言 |
| `reasoning.test.ts` | 如果存在则新增测试 |

## 不回退承诺

以下路径完全不受影响：
- **Anthropic 格式模型**（deepseek-v4-pro、deepseek-v4-flash 等）— 走 `createAnthropic`，不改
- **OpenAI 官方 API** — 走 `createOpenAI`，不改
- **搜索工具**、**审核流水线**、**YAML 合并** — 均不涉及

## 参考

- Cherry Studio 实现：`src/renderer/src/aiCore/utils/reasoning.ts:344-358`
- SiliconFlow API 文档：https://docs.siliconflow.cn/api-reference/chat-completions/chat-completions
- Vercel AI SDK openai-compatible：https://github.com/vercel/ai/blob/main/content/providers/02-openai-compatible-providers/index.mdx
