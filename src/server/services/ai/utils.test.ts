import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

void describe('deepMerge', () => {
  void it('deep-merges objects while replacing arrays and scalars', () => {
    const { deepMerge } = require('./utils') as typeof import('./utils');

    const result = deepMerge(
      {
        yield: { lemma: 'see', language: 'en' },
        application: { selected_examples: [{ sentence: 'old' }] },
      },
      {
        yield: { language: 'de', part_of_speech: 'noun' },
        application: { selected_examples: [{ sentence: 'new' }] },
      }
    );

    assert.deepEqual(result, {
      yield: { lemma: 'see', language: 'de', part_of_speech: 'noun' },
      application: { selected_examples: [{ sentence: 'new' }] },
    });
  });
});
