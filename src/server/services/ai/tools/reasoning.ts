export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';

interface ReasoningResult {
  providerOptions: Record<string, Record<string, string | number | boolean | null>>;
  metadata: { effort: ReasoningEffort; enabled: boolean };
}

export function buildReasoningParams(
  format: 'openai' | 'anthropic',
  effort: ReasoningEffort = 'auto',
  provider?: string
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
  const providerKey = provider || 'openai';

  // SiliconFlow DeepSeek thinking mode is controlled by provider-specific
  // Chat Completions fields, not OpenAI's reasoning_effort field.
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

module.exports = { buildReasoningParams };
