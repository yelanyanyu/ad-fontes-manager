import { describe, expect, it } from 'vitest';
import { generateCardHTML } from './generator';

const baseWord = {
  yield: {
    user_word: 'drive',
    lemma: 'drive',
    syllabification: 'drive',
    user_context_sentence: 'I drive to work.',
    part_of_speech: 'verb',
    contextual_meaning: {
      en: 'operate a vehicle',
      zh: '驾驶',
    },
    other_common_meanings: ['push forward'],
    word_forms: ['drives', 'drove', 'driven'],
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
      source_word: 'Old English drifan',
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
};

describe('generateCardHTML', () => {
  it('does not render English cognate family instruction in the HTML card', () => {
    const html = generateCardHTML({
      ...baseWord,
      cognate_family: {
        instruction: 'Do not show this prompt-only instruction.',
        cognates: [{ word: 'drift', logic: 'same movement image' }],
      },
    });

    expect(html).not.toContain('Do not show this prompt-only instruction.');
    expect(html).toContain('drift');
  });

  it('does not render German cognate family instruction in the HTML card', () => {
    const html = generateCardHTML({
      ...baseWord,
      yield: {
        ...baseWord.yield,
        contextual_meaning: {
          de: 'ein Fahrzeug führen',
          zh: '驾驶',
        },
      },
      etymology: {
        morphological_analysis: {
          word_formation: 'Simplex',
          components: [{ element: 'fahren', type: 'Wortstamm', de_meaning: 'sich bewegen' }],
          structure_analysis: 'einfacher Stamm',
        },
        historical_origins: {
          earliest_attestation: 'Althochdeutsch faran',
          source_word: {
            language: 'gem-pro',
            word: '*faraną',
            meaning: 'to go, travel',
            relation: 'inherited_from',
          },
          pgmc_root: '*faraną',
          pie_root: '*per-',
          sound_changes: 'PIE *p > PGmc *f',
        },
        visual_imagery_zh: '移动之力',
        meaning_evolution_zh: '从行进到驾驶',
      },
      word_formation: {
        derivations: [
          {
            language: 'de',
            word: 'Fahrt',
            part_of_speech: 'Nomen',
            relation: 'nominalization',
            logic: 'fahren gives Fahrt its movement image.',
          },
        ],
      },
      cognate_family: {
        instruction: 'Diese Anweisung darf nicht angezeigt werden.',
        cognates: [
          {
            word: 'fare',
            language: 'en',
            relation: 'cognate',
            logic: 'same Germanic movement image',
          },
        ],
      },
    });

    expect(html).not.toContain('Diese Anweisung darf nicht angezeigt werden.');
    expect(html).toContain('Etymology: Deep Analysis');
    expect(html).toContain('ROOT: fahren');
    expect(html).toContain('*faraną (gem-pro, inherited_from): to go, travel');
    expect(html).toContain('History:');
    expect(html).toContain('PIE *p > PGmc *f');
    expect(html).toContain('fare');
    expect(html).toContain('en, cognate');
    expect(html).not.toContain('Etymologie: Morphologische Analyse');
    expect(html).not.toContain('Historische Ursprünge');
  });

  it('renders Word Schema v2 word forms and structured source words in the HTML card', () => {
    const html = generateCardHTML({
      ...baseWord,
      etymology: {
        ...baseWord.etymology,
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
      },
      cognate_family: {
        cognates: [{ word: 'drift', logic: 'same movement image' }],
      },
    });

    expect(html).toContain('drives');
    expect(html).toContain('drove');
    expect(html).toContain('driven');
    expect(html).toContain('drifan (Old English, ancestor): to drive, push');
    expect(html).toContain('Word Formation');
    expect(html).toContain('Old English · verb · ancestor');
    expect(html).toContain('Old English drifan supplies the inherited movement and pushing image.');
    expect(html).not.toContain('[object Object]');
  });
});
