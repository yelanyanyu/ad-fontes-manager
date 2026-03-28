import { describe, expect, it } from 'vitest';
import {
  computeEffectiveLimitPerMinute,
  computeMinTimeMs,
  parseRetryAfterMs,
} from '@/utils/requestRateLimit';

describe('requestRateLimit', () => {
  it('computes effective limit as three quarters of the configured value', () => {
    expect(computeEffectiveLimitPerMinute(100)).toBe(75);
    expect(computeEffectiveLimitPerMinute(300)).toBe(225);
    expect(computeEffectiveLimitPerMinute(1)).toBe(1);
  });

  it('returns zero when limit is disabled', () => {
    expect(computeEffectiveLimitPerMinute(0)).toBe(0);
    expect(computeMinTimeMs(0)).toBe(0);
  });

  it('computes minTime from effective limit', () => {
    expect(computeMinTimeMs(75)).toBe(800);
    expect(computeMinTimeMs(225)).toBe(267);
  });

  it('parses Retry-After numeric seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('parses Retry-After date format', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const next = 'Thu, 01 Jan 2026 00:00:03 GMT';
    expect(parseRetryAfterMs(next, now)).toBe(3000);
  });
});
