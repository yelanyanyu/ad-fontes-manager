import { describe, expect, it } from 'vitest';

import { resolveManualRepairSources } from './manualRepairSources';

describe('manual repair sources', () => {
  it('uses searching plus pondering raw text as original YAML instead of the final job YAML', () => {
    const sources = resolveManualRepairSources({
      yaml: 'yield:\n  lemma: dish\netymology:\n  historical_origins:\n    - note: bad shape\n',
      steps: [
        {
          step: 'searching',
          status: 'complete',
          rawText:
            '```yaml\nyield:\n  lemma: dish\netymology:\n  historical_origins:\n    source_word:\n      word: discus\n```',
        },
        {
          step: 'pondering',
          status: 'complete',
          rawText: 'etymology:\n  visual_imagery_zh: 白盘子叠在木架上。',
        },
      ],
    });

    expect(sources.minimalInputYaml).toContain('- note: bad shape');
    expect(sources.originalYaml).toContain('source_word:');
    expect(sources.originalYaml).toContain('visual_imagery_zh');
    expect(sources.originalYaml).not.toBe(sources.minimalInputYaml);
  });
});
