import { describe, expect, it } from 'vitest';
import { buildDisplaySteps } from './stageDisplay';
import type { StepState } from '@/composables/useAiGenerate';

describe('stageDisplay', () => {
  it('keeps fixing below auditing even when progress events arrive out of order', () => {
    const steps: StepState[] = [
      { step: 'searching', status: 'complete' },
      { step: 'pondering', status: 'complete' },
      { step: 'fixing', status: 'complete' },
      { step: 'auditing', status: 'complete' },
    ];

    expect(buildDisplaySteps(steps, false).map(step => step.step)).toEqual([
      'searching',
      'pondering',
      'auditing',
      'fixing',
    ]);
  });

  it('adds pending fixing at the stable final position when revision notes exist', () => {
    const steps: StepState[] = [
      { step: 'searching', status: 'complete' },
      { step: 'pondering', status: 'complete' },
      { step: 'auditing', status: 'complete' },
    ];

    expect(buildDisplaySteps(steps, true)).toMatchObject([
      { step: 'searching' },
      { step: 'pondering' },
      { step: 'auditing' },
      { step: 'fixing', status: 'pending' },
    ]);
  });
});
