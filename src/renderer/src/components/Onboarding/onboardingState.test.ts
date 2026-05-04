import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ONBOARDING_COMPLETE_KEY,
  ONBOARDING_REPLAY_EVENT,
  clearOnboardingComplete,
  isOnboardingComplete,
  markOnboardingComplete,
  requestOnboardingReplay,
} from './onboardingState';

const storage = new Map<string, string>();
const dispatchEvent = vi.fn();

beforeEach(() => {
  storage.clear();
  dispatchEvent.mockClear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', { dispatchEvent });
});

describe('onboardingState', () => {
  it('tracks completion in localStorage', () => {
    expect(isOnboardingComplete()).toBe(false);

    markOnboardingComplete();

    expect(storage.get(ONBOARDING_COMPLETE_KEY)).toBe('true');
    expect(isOnboardingComplete()).toBe(true);
  });

  it('clears completion and dispatches replay event', () => {
    storage.set(ONBOARDING_COMPLETE_KEY, 'true');

    requestOnboardingReplay();

    expect(storage.has(ONBOARDING_COMPLETE_KEY)).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledWith(
      new CustomEvent(ONBOARDING_REPLAY_EVENT, { detail: { targetPath: '/' } })
    );
  });

  it('clears completion without dispatching replay', () => {
    storage.set(ONBOARDING_COMPLETE_KEY, 'true');

    clearOnboardingComplete();

    expect(storage.has(ONBOARDING_COMPLETE_KEY)).toBe(false);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
