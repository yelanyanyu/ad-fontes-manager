const { z } = require('zod') as typeof import('zod');

const AIEndpointTypeSchema = z.enum(['openai', 'anthropic']);

const AIProviderSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Provider ID is required')
    .regex(/^[a-z0-9_-]+$/, 'Provider ID must be lowercase alphanumeric (a-z, 0-9, _, -)'),
  name: z.string().trim().min(1, 'Provider name is required'),
  type: AIEndpointTypeSchema.default('openai'),
  baseUrl: z.string().trim().url('Must be a valid URL'),
  anthropicBaseUrl: z.string().trim().url('Must be a valid URL').optional(),
  apiKey: z.string().default(''),
  models: z
    .array(
      z.object({
        id: z.string().trim().min(1, 'Model ID is required'),
        name: z.string().trim().min(1, 'Model name is required'),
        endpointType: AIEndpointTypeSchema.optional(),
      })
    )
    .min(1, 'At least one model is required'),
});

const AISearchConfigSchema = z.object({
  provider: z.enum(['brave', 'tavily']).default('brave'),
  apiKey: z.string().default(''),
  autoDomains: z.boolean().default(true),
  domains: z
    .object({
      common: z.array(z.string().trim().min(1)).default([]),
      en: z.array(z.string().trim().min(1)).default([]),
      de: z.array(z.string().trim().min(1)).default([]),
    })
    .default({ common: [], en: [], de: [] }),
});

const AIStageConfigSchema = z.object({
  provider: z.string().trim().min(1, 'Provider is required'),
  model: z.string().trim().min(1, 'Model is required'),
  reasoningEffort: z
    .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'auto'])
    .default('auto'),
});

const AIStageMapSchema = z
  .object({
    fast: AIStageConfigSchema.optional(),
    balanced: AIStageConfigSchema.optional(),
    expert: AIStageConfigSchema.optional(),
  })
  .default({});

const AIReviewConfigSchema = z
  .object({
    threshold: z.number().int().min(1).max(10).default(6),
    thresholdByLanguage: z.record(z.string(), z.number().int().min(1).max(10)).default({}),
    aiFlavorMarkers: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          label: z.string().trim().min(1),
          pattern: z.string().trim().min(1),
          description: z.string().trim().optional(),
          fields: z.array(z.string().trim().min(1)).optional(),
          enabled: z.boolean().default(true),
        })
      )
      .default([]),
  })
  .default({ threshold: 6, thresholdByLanguage: {}, aiFlavorMarkers: [] });

const AIConfigSchema = z.object({
  providers: z.array(AIProviderSchema).default([]),
  queue_concurrency: z.number().int().min(1).default(5),
  search: AISearchConfigSchema.optional(),
  stages: AIStageMapSchema,
  review: AIReviewConfigSchema,
});

const AIConfigUpdateSchema = z.object({
  providers: z.array(AIProviderSchema).optional(),
  queue_concurrency: z.number().int().min(1).optional(),
  search: AISearchConfigSchema.optional(),
  stages: z
    .object({
      fast: AIStageConfigSchema.optional(),
      balanced: AIStageConfigSchema.optional(),
      expert: AIStageConfigSchema.optional(),
    })
    .optional(),
  review: z
    .object({
      threshold: z.number().int().min(1).max(10).optional(),
      thresholdByLanguage: z.record(z.string(), z.number().int().min(1).max(10)).optional(),
      aiFlavorMarkers: z
        .array(
          z.object({
            id: z.string().trim().min(1),
            label: z.string().trim().min(1),
            pattern: z.string().trim().min(1),
            description: z.string().trim().optional(),
            fields: z.array(z.string().trim().min(1)).optional(),
            enabled: z.boolean().default(true),
          })
        )
        .optional(),
    })
    .optional(),
});

const TestProviderInputSchema = z.object({
  providerId: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().url('Must be a valid URL'),
  anthropicBaseUrl: z.string().trim().url('Must be a valid URL').optional(),
  apiKey: z.string().min(1, 'API Key is required'),
  type: AIEndpointTypeSchema,
  modelEndpointType: AIEndpointTypeSchema.optional(),
  model: z.string().trim().min(1, 'Model is required'),
});

const TestSearchInputSchema = z.object({
  provider: z.enum(['brave', 'tavily']),
  apiKey: z.string().min(1, 'API Key is required'),
});

const RevealAISecretInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('provider'),
    providerId: z.string().trim().min(1, 'Provider ID is required'),
  }),
  z.object({
    kind: z.literal('search'),
    provider: z.enum(['brave', 'tavily']),
  }),
]);

module.exports = {
  AIConfigSchema,
  AIConfigUpdateSchema,
  AIProviderSchema,
  AISearchConfigSchema,
  AIStageConfigSchema,
  TestProviderInputSchema,
  TestSearchInputSchema,
  RevealAISecretInputSchema,
};
