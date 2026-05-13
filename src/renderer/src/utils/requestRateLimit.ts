import Bottleneck from 'bottleneck';

const SAFETY_RATIO = 0.75;
const DEFAULT_LIMIT_PER_MINUTE = 0;

let configuredLimitPerMinute = DEFAULT_LIMIT_PER_MINUTE;
let effectiveLimitPerMinute = 0;
let limiter: Bottleneck | null = null;
let blockedUntil = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

export const computeEffectiveLimitPerMinute = (limitPerMinute: number): number => {
  if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(limitPerMinute * SAFETY_RATIO));
};

export const computeMinTimeMs = (effectiveLimit: number): number => {
  if (!Number.isFinite(effectiveLimit) || effectiveLimit <= 0) {
    return 0;
  }

  return Math.ceil(60_000 / effectiveLimit);
};

export const parseRetryAfterMs = (value: unknown, now = Date.now()): number => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 0;
  }

  const numericSeconds = Number(value);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.ceil(numericSeconds * 1000);
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return 0;
  }

  return Math.max(0, retryAt - now);
};

const ensureLimiter = (): void => {
  const nextEffectiveLimit = computeEffectiveLimitPerMinute(configuredLimitPerMinute);
  effectiveLimitPerMinute = nextEffectiveLimit;

  if (nextEffectiveLimit <= 0) {
    limiter = null;
    return;
  }

  const minTime = computeMinTimeMs(nextEffectiveLimit);
  if (!limiter) {
    limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime,
    });
    return;
  }

  limiter.updateSettings({
    maxConcurrent: 1,
    minTime,
  });
};

const waitForGlobalPause = async (): Promise<void> => {
  const waitMs = blockedUntil - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
};

export const configureRateLimitPerMinute = (limitPerMinute: number): void => {
  if (!Number.isFinite(limitPerMinute) || limitPerMinute < 0) {
    configuredLimitPerMinute = DEFAULT_LIMIT_PER_MINUTE;
  } else {
    configuredLimitPerMinute = Math.floor(limitPerMinute);
  }

  ensureLimiter();
};

export const pauseRateLimitedQueue = (durationMs: number): void => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }

  blockedUntil = Math.max(blockedUntil, Date.now() + Math.ceil(durationMs));
};

export const scheduleRateLimitedRequest = async <T>(task: () => Promise<T>): Promise<T> => {
  if (!limiter) {
    await waitForGlobalPause();
    return task();
  }

  return limiter.schedule(async () => {
    await waitForGlobalPause();
    return task();
  });
};

export const getRateLimitState = (): {
  configuredLimitPerMinute: number;
  effectiveLimitPerMinute: number;
  minTimeMs: number;
} => {
  return {
    configuredLimitPerMinute,
    effectiveLimitPerMinute,
    minTimeMs: computeMinTimeMs(effectiveLimitPerMinute),
  };
};

configureRateLimitPerMinute(DEFAULT_LIMIT_PER_MINUTE);
