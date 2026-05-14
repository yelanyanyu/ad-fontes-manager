import type { StepState } from '@/composables/useAiGenerate';

export const STAGE_DISPLAY_ORDER = ['searching', 'pondering', 'auditing', 'fixing'] as const;

const orderIndex = new Map<string, number>(STAGE_DISPLAY_ORDER.map((step, index) => [step, index]));

export function buildDisplaySteps(steps: StepState[], includePendingFix: boolean): StepState[] {
  const displaySteps = [...steps];
  if (includePendingFix && !displaySteps.some(step => step.step === 'fixing')) {
    displaySteps.push({ step: 'fixing', status: 'pending' });
  }

  // Progress events can arrive in resume/fix order; the UI keeps pipeline stages spatially stable.
  return displaySteps.sort((left, right) => {
    const leftIndex = orderIndex.get(left.step) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.step) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}
