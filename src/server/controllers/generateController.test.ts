import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { PipelineJob } from '../services/ai/types';

void describe('generateController internals', () => {
  void it('selects the German pipeline for de language', () => {
    const { _internal } = require('./generateController') as {
      _internal: { selectPipeline: (language: string) => { language: string; id: string } };
    };

    const pipeline = _internal.selectPipeline('de');

    assert.equal(pipeline.language, 'de');
    assert.equal(pipeline.id, 'single-word-de-v2');
  });

  void it('rebuilds previous context from completed steps before the requested resume stage', () => {
    const { _internal } = require('./generateController') as {
      _internal: {
        buildResumeState: (
          job: PipelineJob,
          fromStage: string
        ) => { previousContext: Record<string, unknown>; previousSteps: Array<{ step: string }> };
      };
    };
    const job: PipelineJob = {
      jobId: 'job-1',
      word: 'conduct',
      language: 'en',
      status: 'complete',
      startedAt: Date.now(),
      steps: [
        {
          step: 'searching',
          status: 'complete',
          startTime: 1,
          result: { researchYaml: 'yield:\n  lemma: conduct\n' },
        },
        {
          step: 'pondering',
          status: 'complete',
          startTime: 2,
          result: { creativeYaml: 'etymology:\n  visual_imagery_zh: test\n' },
        },
        {
          step: 'auditing',
          status: 'complete',
          startTime: 3,
          result: { scores: { overall_score: 7 } },
        },
      ],
    };

    const state = _internal.buildResumeState(job, 'pondering');

    assert.deepEqual(
      state.previousSteps.map(step => step.step),
      ['searching']
    );
    assert.deepEqual(state.previousContext, { researchYaml: 'yield:\n  lemma: conduct\n' });
  });
});
