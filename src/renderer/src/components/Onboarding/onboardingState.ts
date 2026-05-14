export const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
export const ONBOARDING_REPLAY_EVENT = 'ad-fontes:onboarding-replay';
export const ONBOARDING_NAVIGATE_EVENT = 'ad-fontes:onboarding-navigate';

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  } catch {
    /* noop */
  }
}

export function clearOnboardingComplete(): void {
  try {
    localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  } catch {
    /* noop */
  }
}

export function requestOnboardingReplay(): void {
  clearOnboardingComplete();
  window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT, { detail: { targetPath: '/' } }));
}
