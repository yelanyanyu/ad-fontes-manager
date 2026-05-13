const { loggers } = require('../../../utils/logger') as {
  loggers: {
    ai: {
      info: (payload: Record<string, unknown>, message?: string) => void;
      warn: (payload: Record<string, unknown>, message?: string) => void;
      error: (payload: Record<string, unknown>, message?: string) => void;
    };
  };
};

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
}

interface BuildToolOptions<TInput, TOutput> {
  id: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  timeoutMs?: number;
  maxRetries?: number;
}

function classifyError(err: unknown): { errorCode: string; willRetry: boolean } {
  if (!(err instanceof Error)) return { errorCode: 'unknown_error', willRetry: false };
  const msg = err.message.toLowerCase();
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return { errorCode: 'rate_limit', willRetry: true };
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return { errorCode: 'provider_5xx', willRetry: true };
  }
  if (msg.includes('timeout') || msg.includes('abort')) {
    return { errorCode: 'timeout', willRetry: false };
  }
  return { errorCode: 'tool_error', willRetry: false };
}

async function executeWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BACKOFF_SCHEDULE = [2000, 8000];

export function buildTool<TInput, TOutput>(options: BuildToolOptions<TInput, TOutput>) {
  const { id, description, inputSchema, execute, timeoutMs = 30000, maxRetries = 2 } = options;

  async function run(input: TInput): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const data = await executeWithTimeout(signal => execute(input, signal), timeoutMs);
        loggers.ai.info(
          { tool: id, event: 'complete', durationMs: Date.now() - startTime, attempt: attempt + 1 },
          'AI tool completed'
        );
        return { success: true, data };
      } catch (err) {
        lastError = err;
        const { errorCode, willRetry } = classifyError(err);
        if (willRetry && attempt < maxRetries) {
          const delay = BACKOFF_SCHEDULE[attempt] || BACKOFF_SCHEDULE[BACKOFF_SCHEDULE.length - 1];
          loggers.ai.warn(
            { tool: id, event: 'retry', errorCode, attempt: attempt + 1, delayMs: delay },
            'AI tool retrying'
          );
          await sleep(delay);
          continue;
        }
        const errorMessage = err instanceof Error ? err.message : String(err);
        loggers.ai.error(
          {
            tool: id,
            event: 'error',
            errorCode,
            durationMs: Date.now() - startTime,
            error: errorMessage,
          },
          'AI tool failed'
        );
        return { success: false, errorCode, errorMessage };
      }
    }

    return {
      success: false,
      errorCode: 'max_retries_exceeded',
      errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
    };
  }

  return { id, description, inputSchema, run };
}

module.exports = { buildTool };
