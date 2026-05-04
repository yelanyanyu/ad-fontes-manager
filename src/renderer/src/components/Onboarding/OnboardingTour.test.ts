import { describe, expect, it } from 'vitest';

import { ONBOARDING_STEPS } from './OnboardingTour';

describe('OnboardingTour', () => {
  it('defines the five steps from the task plan', () => {
    expect(ONBOARDING_STEPS.map(step => step.element)).toEqual([
      '[data-tour="word-editor"]',
      '[data-tour="word-list"]',
      '[data-tour="language-switcher"]',
      '[data-tour="generate-entry"]',
      '[data-tour="announcement-bell"]',
    ]);
  });
});
