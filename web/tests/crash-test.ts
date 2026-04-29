// Isolated test to find the crash point in v2 API

const express = require('express') as typeof import('express');
const app = express();
app.use(express.json());
app.use('/api', require('../routes/core.ts'));
app.use('/api/v2/words', require('../routes/wordsV2.ts'));

const { errorHandler } = require('../middleware/errorHandler.ts') as {
  errorHandler: (err: unknown, req: unknown, res: unknown, next: unknown) => void;
};
app.use(errorHandler);

const server = app.listen(8082, () => {
  console.log('Test server on 8082');
  runTests().catch(e => {
    console.error('TEST ERROR:', e);
    process.exit(1);
  });
});

async function runTests() {
  const simpleYaml = `yield:
  user_word: "crash"
  lemma: "crashtest2"
  syllabification: "test"
  user_context_sentence: "test"
  part_of_speech: "noun"
  contextual_meaning:
    en: "test"
    zh: "test"
  other_common_meanings:
    - "test"
etymology:
  root_and_affixes:
    prefix: "N/A"
    root: "test"
    suffix: "N/A"
    structure_analysis: "test"
  historical_origins:
    history_myth: "test"
    source_word: "test"
    pie_root: "test"
  visual_imagery_zh: "test"
  meaning_evolution_zh: "test"
cognate_family:
  cognates:
    - word: "test"
      logic: "test"
application:
  selected_examples:
    - type: "test"
      sentence: "test"
      translation_zh: "test"
nuance:
  image_differentiation_zh: "test"
  synonyms:
    - word: "test"
      meaning_zh: "test"`;

  // Test 1: Create word
  console.log('>>> Test 1: Create');
  const r1 = await fetch('http://127.0.0.1:8082/api/v2/words/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'dev-token-not-for-production',
    },
    body: JSON.stringify({ word: 'crashtest2', yaml: simpleYaml }),
  });
  console.log('Status:', r1.status);
  console.log('Body:', await r1.text());

  // Test 2: Duplicate
  console.log('>>> Test 2: Duplicate');
  const r2 = await fetch('http://127.0.0.1:8082/api/v2/words/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': 'dev-token-not-for-production',
    },
    body: JSON.stringify({ word: 'crashtest2', yaml: simpleYaml }),
  });
  console.log('Status:', r2.status);
  console.log('Body:', await r2.text());

  // Test 3: Server alive
  console.log('>>> Test 3: Server alive?');
  const r3 = await fetch('http://127.0.0.1:8082/api/status');
  console.log('Alive:', r3.status);

  server.close();
  process.exit(0);
}
