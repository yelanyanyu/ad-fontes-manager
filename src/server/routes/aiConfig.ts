import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

const express = require('express') as typeof import('express');
const router = express.Router();

const { asyncHandler, BadRequest } = require('../utils/errors') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
  BadRequest: (message: string, data?: unknown) => Error;
};
const { requireWriteAccess } = require('../middleware/writeAuth') as {
  requireWriteAccess: (req: Request, res: Response, next: NextFunction) => void;
};
const { validateBody } = require('../middleware/validate') as {
  validateBody: (
    schema: ZodType<unknown>
  ) => (req: Request, res: Response, next: NextFunction) => void;
};
const { TestProviderInputSchema } = require('../schemas/aiConfig') as {
  TestProviderInputSchema: ZodType<unknown>;
};
const { getAIConfigMasked, updateAIConfig, resolveProviderApiKeyForTest } =
  require('../services/ai/configService') as {
    getAIConfigMasked: () => unknown;
    updateAIConfig: (input: unknown) => unknown;
    resolveProviderApiKeyForTest: (providerId: string | undefined, inputApiKey: string) => string;
  };
const { loggers } = require('../utils/logger') as {
  loggers: {
    ai: {
      info: (payload: Record<string, unknown>, message?: string) => void;
      error: (payload: Record<string, unknown>, message?: string) => void;
    };
  };
};

interface TestProviderBody {
  providerId?: string;
  baseUrl: string;
  apiKey: string;
  type: 'openai' | 'anthropic';
  model: string;
}

const API_VERSION_REGEX = /\/v\d+(?:alpha|beta)?(?:\/|$)/i;

function formatApiHost(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  try {
    const pathname = new URL(normalized).pathname;
    if (API_VERSION_REGEX.test(pathname)) {
      return normalized;
    }
  } catch {
    if (API_VERSION_REGEX.test(normalized)) {
      return normalized;
    }
  }
  return `${normalized}/v1`;
}

router.get(
  '/config/ai',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getAIConfigMasked());
  })
);

router.put(
  '/config/ai',
  requireWriteAccess,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      res.json(updateAIConfig(req.body));
    } catch (error) {
      if ((error as { name?: string }).name === 'ZodError') {
        throw BadRequest('AI config validation failed', {
          code: 'VALIDATION_ERROR',
          issues: (error as { issues?: unknown }).issues,
        });
      }
      throw error;
    }
  })
);

router.post(
  '/config/ai/test-provider',
  requireWriteAccess,
  validateBody(TestProviderInputSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { providerId, baseUrl, type, model } = req.body as TestProviderBody;
    const apiKey = resolveProviderApiKeyForTest(providerId, (req.body as TestProviderBody).apiKey);
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const start = Date.now();
    const controller = new globalThis.AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const chatUrl =
      type === 'anthropic'
        ? `${normalizedBase}/messages`
        : `${formatApiHost(baseUrl)}/chat/completions`;

    const body = JSON.stringify({
      model,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }],
    });

    try {
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        loggers.ai.error(
          {
            baseUrl,
            chatUrl,
            type,
            model,
            latencyMs,
            statusCode: response.status,
            body: errorBody.slice(0, 500),
          },
          'Provider connectivity test failed'
        );
        res.json({
          ok: false,
          latencyMs,
          error: `HTTP ${response.status} ${response.statusText}`,
          statusCode: response.status,
        });
        return;
      }

      loggers.ai.info(
        { baseUrl, chatUrl, type, model, latencyMs, ok: true },
        'Provider connectivity test succeeded'
      );
      res.json({ ok: true, latencyMs });
    } catch (error) {
      const latencyMs = Date.now() - start;
      const err = error as { name?: string; message?: string };
      const message = err.name === 'AbortError' ? 'Connection timed out (15s)' : err.message;
      loggers.ai.error(
        { baseUrl, chatUrl, type, model, latencyMs, error: message },
        'Provider connectivity test error'
      );
      res.json({ ok: false, error: message || 'Connection failed', latencyMs });
    } finally {
      clearTimeout(timeout);
    }
  })
);

module.exports = router;
