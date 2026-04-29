const { GermanWordSchema } = require('../schemas/word/german');

// Test: misplaced visual_imagery_zh inside historical_origins
const badData = {
  yield: {
    user_word: 'test', lemma: 'test', genus: 'das', syllabification: 'test',
    kasus: 'Nominativ', user_context_sentence: 'test', part_of_speech: 'Nomen',
    contextual_meaning: { de: 'test', zh: 'test' },
    other_common_meanings: ['test'],
  },
  etymology: {
    morphological_analysis: {
      word_formation: 'Derivatum', structure_analysis: 'test',
      components: [{ element: 'be-', type: 'Präfix', de_meaning: 'test' }],
    },
    historical_origins: {
      earliest_attestation: 'test', source_form: 'test', pgmc_root: 'test',
      pie_root: 'test', sound_changes: 'test',
      visual_imagery_zh: 'MISPLACED!',  // ← should be rejected
    },
    visual_imagery_zh: 'correct place',
    meaning_evolution_zh: 'test',
  },
  cognate_family: { cognates: [{ word: 'test', logic: 'test' }] },
  application: { selected_examples: [{ type: 'test', sentence: 'test', translation_zh: 'test' }] },
  nuance: { image_differentiation_zh: 'test', synonyms: [{ word: 'test', meaning_zh: 'test' }] },
};

const r1 = GermanWordSchema.safeParse(badData);
console.log('Misplaced field test:', r1.success ? 'PASSED (BAD!)' : 'REJECTED (GOOD)');
if (!r1.success) r1.error.issues.forEach((i: { path: (string | number)[]; message: string }) => console.log(' -', i.path.join('.'), ':', i.message));

const goodData = JSON.parse(JSON.stringify(badData));
delete (goodData.etymology.historical_origins as any).visual_imagery_zh;

const r2 = GermanWordSchema.safeParse(goodData);
console.log('Correct data test:', r2.success ? 'PASSED (GOOD)' : 'REJECTED (BAD)');
if (!r2.success) r2.error.issues.forEach(i => console.log(' -', i.path.join('.'), ':', i.message));
