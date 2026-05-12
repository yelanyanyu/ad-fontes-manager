import { describe, expect, it } from 'vitest';
import { parseBatchJson, parseBatchText } from './batchGenerateParser';

describe('batchGenerateParser', () => {
  it('parses one word per line as minimal batch items', () => {
    expect(parseBatchText('proliferate\nameliorate').items).toEqual([
      { word: 'proliferate' },
      { word: 'ameliorate' },
    ]);
  });

  it('parses blank-line separated key value blocks', () => {
    const result = parseBatchText(`proliferate
context: The idea began to proliferate.
notes: Latin root

word: ameliorate`);

    expect(result.items).toEqual([
      {
        word: 'proliferate',
        context: 'The idea began to proliferate.',
        notes: 'Latin root',
      },
      { word: 'ameliorate' },
    ]);
  });

  it('parses pipe separated rows', () => {
    expect(parseBatchText('proliferate | context text | note text').items).toEqual([
      { word: 'proliferate', context: 'context text', notes: 'note text' },
    ]);
  });

  it('parses the browser extension JSON contract', () => {
    const result = parseBatchJson(
      JSON.stringify({
        items: [{ word: 'proliferate', context: 'context text' }, { word: 'ameliorate' }],
      })
    );

    expect(result.invalid).toEqual([]);
    expect(result.items).toEqual([
      { word: 'proliferate', context: 'context text' },
      { word: 'ameliorate' },
    ]);
  });
});
