import { describe, expect, it } from 'vitest';

import { ONBOARDING_STEPS } from './OnboardingTour';

describe('OnboardingTour', () => {
  it('defines the settings and AI Generate onboarding flow', () => {
    expect(ONBOARDING_STEPS.map(step => step.element)).toEqual([
      '[data-tour="settings-entry"]',
      '[data-tour="settings-api-tab"]',
      '[data-tour="settings-deepseek-provider"]',
      '[data-tour="settings-provider-website"]',
      '[data-tour="settings-provider-api-key"]',
      '[data-tour="settings-provider-test"]',
      '[data-tour="settings-search-api-nav"]',
      '[data-tour="ai-generate-entry"]',
      '[data-tour="ai-generate-mode"]',
      '[data-tour="ai-generate-submit"]',
      '[data-tour="ai-generate-progress"]',
      '[data-tour="ai-generate-score"]',
      '[data-tour="ai-generate-improve"]',
      '[data-tour="ai-generate-save"]',
      '[data-tour="ai-generate-fill-editor"]',
      '[data-tour="word-editor"]',
      '[data-tour="ai-generate-queue"]',
    ]);
  });
});
