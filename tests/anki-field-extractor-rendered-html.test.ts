import assert from 'node:assert/strict';
import { test } from 'node:test';

const { extractBySource } = require('../src/server/services/anki/fieldExtractor') as {
  extractBySource: (source: 'rendered_html', data: Record<string, unknown>) => string;
};

void test('server rendered_html uses the shared built-in Word card renderer', () => {
  const html = extractBySource('rendered_html', {
    yield: {
      user_word: 'drive',
      lemma: 'drive',
      syllabification: 'drive',
      word_forms: ['drives', 'drove'],
      user_context_sentence: '',
      part_of_speech: 'verb',
      contextual_meaning: {
        en: 'operate a vehicle',
        zh: '驾驶',
      },
      other_common_meanings: ['push forward'],
    },
    etymology: {
      root_and_affixes: {
        prefix: 'N/A',
        root: 'drive',
        suffix: 'N/A',
        structure_analysis: 'simple root',
      },
      historical_origins: {
        history_myth: 'N/A',
        source_word: {
          language: 'Old English',
          word: 'drifan',
          meaning: 'to drive, push',
          relation: 'ancestor',
        },
        pie_root: '*dʰreibʰ-',
      },
      visual_imagery_zh: '推动之力',
      meaning_evolution_zh: '从推动到驾驶',
    },
    word_formation: {
      derivations: [
        {
          language: 'Old English',
          word: 'drifan',
          part_of_speech: 'verb',
          relation: 'ancestor',
          logic: 'Old English drifan supplies the inherited movement and pushing image.',
        },
      ],
    },
    cognate_family: {
      cognates: [{ word: 'drift', logic: 'same movement image' }],
    },
    application: {
      selected_examples: [
        {
          type: 'Current Context',
          sentence: 'I drive to work.',
          translation_zh: '我开车上班。',
        },
      ],
    },
    nuance: {
      synonyms: [{ word: 'operate', meaning_zh: '操作' }],
      image_differentiation_zh: 'drive 更有推动感',
    },
  });

  assert.match(html, /Word Formation/);
  assert.match(html, /drives/);
  assert.match(html, /drifan \(Old English, ancestor\): to drive, push/);
});
