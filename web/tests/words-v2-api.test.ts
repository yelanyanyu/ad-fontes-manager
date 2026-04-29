const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = 'http://localhost:8081/api/v2/words';
const AUTH_HEADER = { 'x-admin-token': 'dev-token-not-for-production' };

type HttpMethod = 'GET' | 'POST' | 'DELETE';

async function api(method: HttpMethod, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  // Remove leading slash: new URL('/add', base) would resolve to origin/add, not base/add
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(cleanPath, BASE.endsWith('/') ? BASE : BASE + '/');
  const headers: Record<string, string> = { ...AUTH_HEADER };
  const init: RequestInit = { method, headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// ==============================================================================
// Test Data
// ==============================================================================

const ENGLISH_YAML = `yield:
  user_word: "gallantry"
  lemma: "gallantry"
  syllabification: "gal-lant-ry"
  user_context_sentence: "His gallantry in battle earned him a medal."
  part_of_speech: "noun"
  contextual_meaning:
    en: "Courageous behavior, especially in battle; polite attention given by men to women."
    zh: "英勇行为；（尤指）骑士风度"
  other_common_meanings:
    - "bravery in combat"
    - "chivalrous attention to women"

etymology:
  root_and_affixes:
    prefix: "N/A"
    root: "-gallant- [brave, noble, showy]"
    suffix: "-ry [state/quality of]"
    structure_analysis: "From French galanterie, from galant (gallant) + -erie (-ery). The root gallant derives from Old French galer (to rejoice, make merry)."
  historical_origins:
    history_myth: "The concept of gallantry evolved from medieval chivalric codes."
    source_word: "French galanterie"
    pie_root: "*wel- (to wish, will)"
  visual_imagery_zh: |
    他站在城墙上，风把披风卷到脸上。城下是昨天交战过的原野，泥里还插着断旗。他没有看那些，只转过身，把手臂伸给身后的女人。她的手搭上来，轻得像一片叶子落在石阶上。
  meaning_evolution_zh: |
    从古法语 galer（欢庆、作乐）到 galant（英勇、殷勤），再到 galanterie（英勇行为/骑士风度）。词义从"享受生活"的具体动作，慢慢迁移到"在危险中表现从容"的气质。

cognate_family:
  cognates:
    - word: "gallant"
      logic: "德语的'gallant'与英语的'gallant'对应，都源自法语 galant，想象'欢庆者'在战场上的从容姿态 = 英勇的/殷勤的"
    - word: "gala"
      logic: "德语的'gala'与英语的'gala'对应，都源自PIE *wel-，想象'愿望达成'的庆祝场景 = 节日盛会"

application:
  selected_examples:
    - type: "Literal / Root Image"
      sentence: "He received a medal for gallantry on the battlefield."
      translation_zh: "他因战场上的英勇行为获得了一枚勋章。"
    - type: "Current Context"
      sentence: "His gallantry in battle earned him a medal."
      translation_zh: "他在战斗中的英勇为他赢得了一枚勋章。"
    - type: "Abstract / Metaphorical"
      sentence: "A bygone era of gallantry and courtly love."
      translation_zh: "一个已经逝去的、充满骑士风度和宫廷爱情的年代。"

nuance:
  synonyms:
    - word: "bravery"
      meaning_zh: "勇敢"
    - word: "chivalry"
      meaning_zh: "骑士精神"
    - word: "valor"
      meaning_zh: "勇猛"
  image_differentiation_zh: |
    bravery 是面对危险时腿不软，是身体的本能压过了恐惧。
    chivalry 是一整套行为准则，gallantry 是其中关于"对待弱者（尤其是女性）"的那个切面。
    valor 是战斗中表现出来的勇敢，gallantry 多了一层"从容"和"仪式感"——它不是单纯的不怕死，是死也要死得好看。
`;

const GERMAN_YAML = `yield:
  user_word: "Bewendenlassen"
  lemma: "bewendenlassen"
  genus: "N/A"
  syllabification: "be-wen-den-las-sen"
  kasus: "N/A"
  part_of_speech: "Verb"
  user_context_sentence: "Wir wollen es für heute bei dieser Erklärung bewenden lassen."
  contextual_meaning:
    de: "Eine Sache an einem bestimmten Punkt abschließen und nicht weiterverfolgen."
    zh: "到此为止，不再深究或采取进一步行动"
  other_common_meanings:
    - "海德格尔哲学概念：让存在者在其因缘整体中开放"
    - "让某事维持原状，停止干预"

etymology:
  morphological_analysis:
    word_formation: "Derivatum"
    components:
      - element: "be-"
        type: "Präfix"
        de_meaning: "及物化或赋予动作特定方向"
      - element: "wend-"
        type: "Wortstamm"
        de_meaning: "转向、扭转"
    structure_analysis: "be- + wenden + lassen 的复合，表示'让某事被转向并停留在那里'"
  historical_origins:
    earliest_attestation: "Mittelhochdeutsch"
    source_form: "bewenden"
    pgmc_root: "*wandijaną"
    pie_root: "*wendʰ- (to turn, twist)"
    sound_changes: "PGmc *dʰ → d (未发生高地德语辅音推移)"
  visual_imagery_zh: |
    手推了一下桌子上的文件，纸页边缘碰到底墙，停住了。指尖从纸面上抬起来，那份重量就留在那里。你后退一步，看着那叠纸纹丝不动地待在桌角——不是遗忘，是决定不再碰它。
  meaning_evolution_zh: |
    从物理的"扭转方向"到"处理事情使其达到终点"。bewenden 本义是"转向"，加上 lassen（让）构成"让某事被转向"，即不再继续操作它。

cognate_family:
  cognates:
    - word: "English: to wend"
      german_equivalent: "wenden"
      logic: "德语的'wenden'与英语的'wend'对应，都源自PGmc *wandijaną，想象'扭转方向'的动作 = 改变路线"
    - word: "English: to wander"
      german_equivalent: "wandern"
      logic: "来自同一个根'wend-'的反复形式，想象'不断转向' = 漫游"
    - word: "English: to wind"
      german_equivalent: "winden"
      logic: "德语的'winden'与英语的'wind'对应，都源自PIE *wendʰ-，想象'缠绕'的动作 = 弯曲"

application:
  selected_examples:
    - type: "Literal / Root Image"
      sentence: "Nach einer halben Stunde Diskussion ließ er die Sache bewenden."
      translation_zh: "讨论了半小时后，他让这件事到此为止。"
    - type: "Current Context"
      sentence: "Wir wollen es für heute bei dieser Erklärung bewenden lassen."
      translation_zh: "今天的解释我们就到此为止吧。"
    - type: "Abstract / Metaphorical"
      sentence: "Heidegger zufolge bedeutet Bewendenlassen, das Seiende in seinem Bewandtnisganzen freizugeben."
      translation_zh: "在海德格尔看来，Bewendenlassen意味着让存在者在其因缘整体中被释放。"

nuance:
  synonyms:
    - word: "aufhören"
      meaning_zh: "停止"
    - word: "belassen"
      meaning_zh: "保留原状"
  image_differentiation_zh: |
    aufhören 是把动作的线剪断，是主动停下。
    belassen 是你离开房间时不碰桌子上的东西，是保持原状。
    bewendenlassen 则是你碰过、转过、处理过，然后在某个点决定不再继续——它有"经过考量后的放下"这层意思。
  germanic_differentiation_zh: "英语里没有直接对应 bewenden 的词。最接近的是 to let it rest，但这个表达缺少德语的'转向'空间隐喻。"

dialectal_notes:
  low_german: "Plattdeutsch 中较少使用"
  alemanic_bavarian: "口语中常用 'Des lass ma so bewenden'"
  yiddish: "可能通过犹太德语哲学文本间接影响"

observations:
  register: "正式，口语固定短语常用，哲学技术词汇"
  false_friends: "与英语 'be wending' 无关"
  calque_status: "海德格尔对这一日常用语的哲学重铸"
`;

// ==============================================================================
// Helper: cleanup test data after each test
// ==============================================================================

async function cleanupWord(lemma: string, language: string) {
  try {
    const checkRes = await api('GET', `?search=${encodeURIComponent(lemma)}&language=${language}`);
    const items = (checkRes.data as { items?: Array<{ id: string }> })?.items || [];
    for (const item of items) {
      await api('DELETE', `/${item.id}`);
    }
  } catch {
    // noop
  }
}

// ==============================================================================
// Tests
// ==============================================================================

test('V2 API: GET /api/v2/words returns English word list', async () => {
  const res = await api('GET', '?language=en&limit=5');
  assert.equal(res.status, 200);
  const body = res.data as { items?: unknown[]; total?: number };
  assert.ok(Array.isArray(body.items), 'items should be an array');
  assert.ok(body.total! > 0, 'total should be > 0');
  const item = body.items![0] as { lemma?: string; language?: string };
  assert.ok(item.lemma, 'item should have lemma');
  assert.equal(item.language, 'en');
});

test('V2 API: GET /api/v2/words?language=de returns empty German word list', async () => {
  const res = await api('GET', '?language=de&limit=1');
  assert.equal(res.status, 200);
  const body = res.data as { items?: unknown[]; total?: number };
  assert.equal(body.total, 0, 'German list should be empty before adding any German words');
});

test('V2 API: GET /api/v2/words/details returns word by lemma', async () => {
  const res = await api('GET', '/details?word=dignity&language=en');
  assert.equal(res.status, 200);
  const body = res.data as { code: number; data?: { lemma?: string; content?: unknown } };
  assert.equal(body.code, 200);
  assert.ok(body.data, 'data should exist');
  // v2 getWordDetails returns content JSON directly merged into the response
});

test('V2 API: POST /api/v2/words/add creates a new English word', async () => {
  await cleanupWord('gallantry', 'en');

  const res = await api('POST', '/add', { word: 'gallantry', yaml: ENGLISH_YAML });
  assert.equal(res.status, 201);
  const body = res.data as { code: number; data?: { lemma?: string; language?: string } };
  assert.equal(body.code, 201);
  assert.equal(body.data?.lemma, 'gallantry');
  assert.equal(body.data?.language, 'en');

  // Verify it's in the list
  const listRes = await api('GET', '?search=gallantry&language=en');
  const listBody = listRes.data as { items?: Array<{ lemma: string }> };
  assert.ok(listBody.items?.some(i => i.lemma === 'gallantry'), 'created word should appear in list');
});

test('V2 API: POST /api/v2/words/add creates a German word', async () => {
  await cleanupWord('bewendenlassen', 'de');

  const res = await api('POST', '/add', { word: 'bewendenlassen', yaml: GERMAN_YAML });
  assert.equal(res.status, 201);
  const body = res.data as { code: number; data?: { lemma?: string; language?: string } };
  assert.equal(body.code, 201);
  assert.equal(body.data?.lemma, 'bewendenlassen');
  assert.equal(body.data?.language, 'de');

  // Verify it appears in German list
  const listRes = await api('GET', '?search=bewendenlassen&language=de');
  const listBody = listRes.data as { items?: Array<{ lemma: string }> };
  assert.ok(listBody.items?.some(i => i.lemma === 'bewendenlassen'), 'German word should appear in German list');

  // Verify it does NOT appear in English list
  const enListRes = await api('GET', '?search=bewendenlassen&language=en');
  const enListBody = enListRes.data as { items?: unknown[] };
  assert.equal(enListBody.items?.length || 0, 0, 'German word should NOT appear in English list');
});

test('V2 API: duplicate lemma + same language returns conflict', async () => {
  const res = await api('POST', '/add', { word: 'gallantry', yaml: ENGLISH_YAML });
  assert.equal(res.status, 409);
});

test('V2 API: same lemma with different languages can coexist', async () => {
  // Use a lemma that exists in English to create a German entry
  const crossoverYaml = GERMAN_YAML.replace('bewendenlassen', 'see')
    .replace('Bewendenlassen', 'See');

  await cleanupWord('see', 'de');

  const res = await api('POST', '/add', { word: 'see', yaml: crossoverYaml });
  assert.equal(res.status, 201);
  const body = res.data as { code: number; data?: { language?: string } };
  assert.equal(body.data?.language, 'de');
});

test('V2 API: POST /api/v2/words saves (upserts) a word', async () => {
  const updatedYaml = ENGLISH_YAML.replace(
    'other_common_meanings:',
    'other_common_meanings:\n    - "updated test meaning"'
  );

  const res = await api('POST', '/', { yaml: updatedYaml, forceUpdate: true });
  assert.equal(res.status, 200);
  const body = res.data as { success?: boolean; status?: string };
  assert.ok(body.success);
});

test('V2 API: GET /api/v2/words/details returns German word with full content', async () => {
  const res = await api('GET', '/details?word=bewendenlassen&language=de');
  assert.equal(res.status, 200);
  const body = res.data as { code: number; data?: Record<string, unknown> };
  assert.equal(body.code, 200);
  assert.ok(body.data, 'data should exist');

  // Verify German-specific fields are accessible
  const data = body.data!;
  assert.ok(data.etymology, 'etymology should exist');

  // Check for German-specific etymology structure
  const etym = data.etymology as Record<string, unknown>;
  assert.ok(etym.morphological_analysis, 'German etymology should have morphological_analysis');
  assert.ok(etym.historical_origins, 'German etymology should have historical_origins');

  // Check for dialectal_notes and observations
  assert.ok(data.dialectal_notes, 'German word should have dialectal_notes');
  assert.ok(data.observations, 'German word should have observations');
});

test('V2 API: language filtering works correctly', async () => {
  const enRes = await api('GET', '?language=en&limit=200');
  const deRes = await api('GET', '?language=de');
  const enBody = enRes.data as { items?: Array<{ language: string }> };
  const deBody = deRes.data as { items?: Array<{ language: string }> };

  // All items in en list should have language=en
  for (const item of (enBody.items || [])) {
    assert.equal(item.language, 'en', `English list item should have language=en`);
  }

  // All items in de list should have language=de
  for (const item of (deBody.items || [])) {
    assert.equal(item.language, 'de', `German list item should have language=de`);
  }
});

test('V2 API: search within language works', async () => {
  const res = await api('GET', '?search=gallantry&language=en');
  assert.equal(res.status, 200);
  const body = res.data as { items?: Array<{ lemma: string }> };
  assert.ok(body.items?.some(i => i.lemma === 'gallantry'), 'search should find gallantry in English');
});

test('V2 API: pagination works', async () => {
  const res = await api('GET', '?language=en&page=1&limit=3');
  assert.equal(res.status, 200);
  const body = res.data as { items?: unknown[]; page: number; limit: number; totalPages: number };
  assert.ok(body.items!.length <= 3, 'items should respect limit');
  assert.equal(body.page, 1);
  assert.equal(body.limit, 3);
  assert.ok(body.totalPages > 1, 'should have multiple pages');
});

// ==============================================================================
// Cleanup
// ==============================================================================

test('V2 API: cleanup — delete test English word', async () => {
  const res = await api('GET', '?search=gallantry&language=en');
  const body = res.data as { items?: Array<{ id: string }> };
  for (const item of (body.items || [])) {
    const delRes = await api('DELETE', `/${item.id}`);
    assert.equal(delRes.status, 200);
  }
});

test('V2 API: cleanup — delete test German words', async () => {
  for (const lemma of ['bewendenlassen', 'see']) {
    const res = await api('GET', `?search=${lemma}&language=de`);
    const body = res.data as { items?: Array<{ id: string }> };
    for (const item of (body.items || [])) {
      const delRes = await api('DELETE', `/${item.id}`);
      assert.equal(delRes.status, 200);
    }
  }
});
