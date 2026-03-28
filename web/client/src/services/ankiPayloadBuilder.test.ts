import { describe, expect, it } from 'vitest';
import { buildExportPayload } from './ankiPayloadBuilder';
import { createAnkiPayload } from './ankiExportService';
import type { WordRecord } from '@/types/word-list';

describe('buildExportPayload', () => {
  it('matches single-export payload generation when local YAML is available', async () => {
    const yamlObject = {
      yield: {
        lemma: 'porto',
      },
      part_of_speech: 'noun',
      language: {
        origin: 'latin',
      },
    };

    const record: WordRecord = {
      id: 'local-1',
      isLocal: true,
      lemma: 'porto',
      original_yaml: yamlObject,
    };

    const options = {
      deckName: 'test-deck',
      modelName: 'AdFontesWord',
      addReverse: true,
      tags: ['ad-fontes'],
    };

    const batchPayload = await buildExportPayload(record, options);
    const singlePayload = createAnkiPayload(
      {
        id: 'local-1',
        data: yamlObject as Record<string, unknown>,
        record,
      },
      options
    );

    expect(batchPayload).toEqual(singlePayload);
  });
});
