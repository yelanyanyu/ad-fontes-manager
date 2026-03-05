const yaml = require('js-yaml') as {
  load: (content: string) => unknown;
};

const { Pool } = require('pg') as {
  Pool: new (config: { connectionString?: string }) => {
    connect: () => Promise<DbPoolClient>;
    end: () => Promise<void>;
  };
};

require('dotenv').config();

type DbPoolClient = import('./utils/db-config').DbPoolClient;
type DbQueryResult<T extends Record<string, unknown> = Record<string, unknown>> =
  import('./utils/db-config').DbQueryResult<T>;
type WordYamlDocument = import('./types/word-yaml').WordYamlDocument;

const SAMPLE_YAML = `
yield:
  user_word: "household"
  lemma: "household"
  syllabification: "house-hold"
  user_context_sentence: "The entire household gathered in the living room to celebrate their grandfather's birthday."
  part_of_speech: "Noun (Collective)"
  contextual_meaning:
    en: "A group of people, often a family, who live together in the same dwelling and share meals or living space."
    zh: "A family or people living together."
  other_common_meanings:
    - "Domestic management or affairs (e.g., household expenses)."
    - "Familiar or common (adj), as in 'a household name'."

etymology:
  root_and_affixes:
    prefix: "N/A"
    root: "Compound Word: House + Hold"
    suffix: "N/A"
    structure_analysis: "Composite of 'House' (dwelling) + 'Hold' (possession/custody)."
  historical_origins:
    history_myth: "In Medieval England, a 'household' was an economic unit including servants and apprentices."
    source_word: "Middle English 'houshold' (14c.)"
    pie_root: "House: *(s)keu-; Hold: *haldan"
  visual_imagery_zh: "Imagine building and maintaining a shelter."
  meaning_evolution_zh: "From managing a house to people living together in one house."

cognate_family:
  instruction: "Use Chinese in this section."
  cognates:
    - word: "Husband"
      logic: "House + bond"
    - word: "Behold"
      logic: "Be + hold"

application:
  selected_examples:
    - type: "Literal"
      sentence: "She manages the household accounts with great care."
      translation_zh: "She manages home accounts carefully."

nuance:
  synonyms:
    - word: "Family"
      meaning_zh: "Blood relation focus"
  image_differentiation_zh: "Household focuses on shared living unit."
`;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function insertData(yamlStr: string): Promise<void> {
  const client = await pool.connect();

  try {
    const parsed = yaml.load(yamlStr);
    const data =
      parsed && typeof parsed === 'object'
        ? (parsed as WordYamlDocument)
        : ({} as WordYamlDocument);
    await client.query('BEGIN');

    const yieldData = data.yield || {};
    const nuanceData = data.nuance || {};

    const wordQuery = `
      INSERT INTO words (
        user_word, lemma, syllabification, part_of_speech,
        user_context_sentence, contextual_meaning_en, contextual_meaning_zh,
        other_common_meanings, image_differentiation_zh, original_yaml
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const wordValues = [
      yieldData.user_word,
      yieldData.lemma,
      yieldData.syllabification,
      yieldData.part_of_speech,
      yieldData.user_context_sentence,
      yieldData.contextual_meaning?.en,
      yieldData.contextual_meaning?.zh,
      yieldData.other_common_meanings || [],
      nuanceData.image_differentiation_zh,
      data,
    ];

    const wordRes = (await client.query(wordQuery, wordValues)) as DbQueryResult<{ id: number }>;
    const wordId = wordRes.rows[0]?.id;
    if (!wordId) {
      throw new Error('Failed to retrieve inserted word id.');
    }

    const etymData = data.etymology || {};
    const roots = etymData.root_and_affixes || {};
    const origins = etymData.historical_origins || {};

    const etymQuery = `
      INSERT INTO etymologies (
        word_id, prefix, root, suffix, structure_analysis,
        history_myth, source_word, pie_root,
        visual_imagery_zh, meaning_evolution_zh
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await client.query(etymQuery, [
      wordId,
      roots.prefix,
      roots.root,
      roots.suffix,
      roots.structure_analysis,
      origins.history_myth,
      origins.source_word,
      origins.pie_root,
      etymData.visual_imagery_zh,
      etymData.meaning_evolution_zh,
    ]);

    const cognates = data.cognate_family?.cognates || [];
    for (const cog of cognates) {
      await client.query(
        'INSERT INTO cognates (word_id, cognate_word, logic) VALUES ($1, $2, $3)',
        [wordId, cog.word, cog.logic]
      );
    }

    const examples = data.application?.selected_examples || [];
    for (const ex of examples) {
      await client.query(
        'INSERT INTO examples (word_id, example_type, sentence, translation_zh) VALUES ($1, $2, $3, $4)',
        [wordId, ex.type, ex.sentence, ex.translation_zh]
      );
    }

    const synonyms = nuanceData.synonyms || [];
    for (const syn of synonyms) {
      await client.query(
        'INSERT INTO synonyms (word_id, synonym_word, meaning_zh) VALUES ($1, $2, $3)',
        [wordId, syn.word, syn.meaning_zh]
      );
    }

    await client.query('COMMIT');
    console.log(`Successfully inserted word: ${yieldData.lemma} (ID: ${wordId})`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error occurred:', error);
    throw error;
  } finally {
    client.release();
  }
}

(async () => {
  console.log('Starting import...');
  // await insertData(SAMPLE_YAML);
  void SAMPLE_YAML;
  void insertData;
  console.log('Import logic ready. Configure DATABASE_URL to run.');
  await pool.end();
})();
