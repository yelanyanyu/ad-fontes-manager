import { describe, expect, it } from 'vitest';
import { buildDisplaySteps, resolveStageDetailsStep } from './stageDisplay';
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

  it('resolves Stage Details by Stage key on the currently selected Job', () => {
    const afterSteps: StepState[] = [
      { step: 'searching', status: 'complete', rawText: 'after search' },
      { step: 'pondering', status: 'complete', rawText: 'after ponder' },
    ];
    const beforeSteps: StepState[] = [
      { step: 'searching', status: 'complete', rawText: 'before search' },
      { step: 'pondering', status: 'pending' },
    ];

    expect(resolveStageDetailsStep(afterSteps, 'pondering')?.rawText).toBe('after ponder');
    expect(resolveStageDetailsStep(beforeSteps, 'pondering')).toEqual({
      step: 'pondering',
      status: 'pending',
    });
  });

  it('closes Stage Details when the selected Stage key is absent on the current Job', () => {
    const steps: StepState[] = [{ step: 'searching', status: 'complete', rawText: 'search' }];

    expect(resolveStageDetailsStep(steps, 'auditing')).toBeNull();
    expect(resolveStageDetailsStep(steps, null)).toBeNull();
  });
});
