const fs = require('fs');
const yaml = require('js-yaml');
const { Pool } = require('pg');
require('dotenv').config();

// Sample YAML Data
const SAMPLE_YAML = `
yield: 
  user_word: "household" 
  lemma: "household" 
  syllabification: "house-hold" 
  user_context_sentence: "The entire household gathered in the living room to celebrate their grandfather's birthday." 
  part_of_speech: "Noun (Collective)" 
  contextual_meaning: 
    en: "A group of people, often a family, who live together in the same dwelling and share meals or living space." 
    zh: "（共同居住的）一家人，一户；家庭（包括所有同住者）。" 
  other_common_meanings: 
    - "Domestic management or affairs (e.g., household expenses)." 
    - "Familiar or common (adj), as in 'a household name'." 

etymology: 
  root_and_affixes: 
    prefix: "N/A" 
    root: "Compound Word: House + Hold" 
    suffix: "N/A" 
    structure_analysis: "Composite of 'House' (dwelling) + 'Hold' (possession/custody). Originally meant 'management of a house'." 
  historical_origins: 
    history_myth: "In Medieval England, a 'household' was not just parents and children, but a functional economic unit including servants and apprentices, all 'held' under one authority." 
    source_word: "Middle English 'houshold' (14c.)" 
    pie_root: "House: *(s)keu- (to cover/hide); Hold: *kel- (to drive/tend cattle) or Germanic *haldan (to watch over)." 
  
  visual_imagery_zh: | 
    想象你站在一片荒野中，正在搭建一个庇护所（House）。 
    1. 场景：你先架起屋顶，用来“覆盖”和“遮蔽”风雨（源自根词 *(s)keu- 的遮盖含义）。 
    2. 动作：不仅是建造，你还要双臂环抱，用力“守住”（Hold）这个空间。你像牧羊人“看管”羊群一样，维持着屋内的秩序和资源。 
    3. 体感：你能感到一种“向心的张力”。屋顶提供了物理的安全感，而你的“把持”确保了屋内的人员和物资不会流散。这种“被覆盖”且“被维系”在一起的状态，就是 Household。 

  meaning_evolution_zh: | 
    最初，这个词侧重于动词性的“持家”或“家务管理”（The holding/keeping of the house）。 
    就像“Hold”不仅意味着“拿”，还意味着“保持状态”（如 hold the line），这个词逐渐从“管理房子的行为”转喻为“被管理的实体”——即住在房子里的所有人。 
    因此，它比“Family”更强调物理空间的共处和经济上的共同体（同在一个屋檐下被维系的一群人）。 

cognate_family: 
  instruction: "请在本板块使用中文。选择 3-4 个同源词。" 
  cognates: 
    - word: "Husband" 
      logic: "House (房屋) + Bond (居住者/耕种者) -> '想象一个男人作为房屋的管理者' = 丈夫（古意为一家之主/农业管理者）。" 
    - word: "Behold" 
      logic: "Be- (加强) + Hold (抓住) -> '想象用眼睛紧紧抓住某个物体' = 注视，看见（把景象保持在视线中）。" 
    - word: "Hide" 
      logic: "源自根词 *(s)keu- (覆盖) -> '想象用兽皮把身体覆盖起来' = 躲藏，兽皮（House 也是一种巨大的覆盖物）。" 

application: 
  selected_examples: 
    - type: "Literal / Root Image" 
      sentence: "She manages the household accounts with great care." 
      translation_zh: "她非常细心地管理着家庭账目（侧重于‘持家/管理’的本义）。" 
    - type: "Current Context" 
      sentence: "According to the census, the average household size has decreased." 
      translation_zh: "根据人口普查，平均每户家庭的人口数量有所减少（侧重于居住单位）。" 
    - type: "Abstract / Metaphorical" 
      sentence: "After the movie's success, the actor became a household name." 
      translation_zh: "那部电影成功后，这位演员成了家喻户晓的名字（字面意：每个家庭都知道的名字）。" 

nuance: 
  synonyms: 
    - word: "Family" 
      meaning_zh: "家庭（侧重血缘和亲属关系）。" 
    - word: "Residence" 
      meaning_zh: "住宅，居所（侧重物理建筑）。" 
  
  image_differentiation_zh: | 
    不同于 **Family** 仅仅暗示“血脉相连”的情感纽带，**Household** 更侧重于“屋檐下的共同运作”。 
    想象 Family 是一张家谱（Blood），你可以住在世界的不同角落； 
    而 Household 是一个有围墙的圆圈（Roof & Control），必须 physically 住在一起，共同分担柴米油盐。这就是为什么人口普查用 Household（住户）而不是 Family，因为它是基于“共同居住”这一动作事实的。 
`;

// DB Configuration (Best Practice: Use Pool)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ad_fontes',
});

async function insertData(yamlStr) {
  const client = await pool.connect();
  
  try {
    const data = yaml.load(yamlStr);
    await client.query('BEGIN');

    // 1. Insert Word
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
      data // Save full JSON
    ];

    const wordRes = await client.query(wordQuery, wordValues);
    const wordId = wordRes.rows[0].id;

    // 2. Insert Etymology
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
      etymData.meaning_evolution_zh
    ]);

    // 3. Insert Cognates
    const cognates = data.cognate_family?.cognates || [];
    for (const cog of cognates) {
      await client.query(
        'INSERT INTO cognates (word_id, cognate_word, logic) VALUES ($1, $2, $3)',
        [wordId, cog.word, cog.logic]
      );
    }

    // 4. Insert Examples
    const examples = data.application?.selected_examples || [];
    for (const ex of examples) {
      await client.query(
        'INSERT INTO examples (word_id, example_type, sentence, translation_zh) VALUES ($1, $2, $3, $4)',
        [wordId, ex.type, ex.sentence, ex.translation_zh]
      );
    }

    // 5. Insert Synonyms
    const synonyms = nuanceData.synonyms || [];
    for (const syn of synonyms) {
      await client.query(
        'INSERT INTO synonyms (word_id, synonym_word, meaning_zh) VALUES ($1, $2, $3)',
        [wordId, syn.word, syn.meaning_zh]
      );
    }

    await client.query('COMMIT');
    console.log(`Successfully inserted word: ${yieldData.lemma} (ID: ${wordId})`);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error occurred:', e);
    throw e;
  } finally {
    client.release();
  }
}

// Run logic
(async () => {
  console.log("Starting import...");
  // Uncomment to run if DB is ready
  // await insertData(SAMPLE_YAML);
  console.log("Import logic ready. Configure DATABASE_URL to run.");
  await pool.end();
})();
