export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'auto';

interface ReasoningResult {
  providerOptions: Record<string, Record<string, string | number | boolean | null>>;
  metadata: { effort: ReasoningEffort; enabled: boolean };
}

export function buildReasoningParams(
  format: 'openai' | 'anthropic',
  effort: ReasoningEffort = 'auto'
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
  return {
    providerOptions: {
      openai: { reasoningEffort: openAIEffort } as unknown as Record<
        string,
        string | number | boolean | null
      >,
    },
    metadata: { effort, enabled: true },
  };
}

module.exports = { buildReasoningParams };
