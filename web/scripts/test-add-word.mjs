const HOST = 'http://localhost:8080';

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { res, data, text };
}

function logResult(name, pass, extra = '') {
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`${name}: ${status}${extra ? ' ' + extra : ''}`);
}

async function findWordId(lemma) {
  const q = new URLSearchParams({ search: lemma, page: '1', limit: '50', sort: 'newest' });
  const { res, data } = await jsonFetch(`${HOST}/api/words?${q.toString()}`);
  if (!res.ok) return null;
  const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  const target = lemma.toLowerCase();
  const hit = items.find(i => String(i.lemma || '').toLowerCase() === target);
  return hit?.id || null;
}

async function deleteIfExists(lemma) {
  const id = await findWordId(lemma);
  if (!id) return;
  await jsonFetch(`${HOST}/api/words/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const aggregateYaml = `yield: 
  user_word: "aggregate" 
  lemma: "aggregate" 
  syllabification: "ag-gre-gate" 
  user_context_sentence: "N/A" 
  part_of_speech: "verb" 
  contextual_meaning: 
    en: "To collect or gather multiple items into a single mass or total." 
    zh: "聚集、总计" 
  other_common_meanings: 
    - "名词-集合体: 作为整体看待的、由多个部分组成的事物总称 (如总质量、总数、集合、总成绩)。" 
    - "名词-具体材料: 用于建筑或复合材料的颗粒状物质 (如混凝土中的骨料、碎石、屋顶用砂石)。" 
    - "形容词-聚集的: 描述由多个部分组成的、集合的、合计的状态 (如总金额、聚生的植物结构)。" 
    - "动词-其他引申: 加入社团、总计达 (某个数量)。" 

etymology: 
  root_and_affixes: 
    prefix: "ad- [to, towards]" 
    root: "-greg- [flock, herd]" 
    suffix: "-ate [verb-forming suffix]" 
    structure_analysis: "前缀 \`ad-\` (向...) + 词根 \`-greg-\` (兽群) + 动词后缀 \`-ate\`，字面意思为“驱赶到兽群里”。这是一个由前缀+词根构成的动词。" 
  historical_origins: 
    history_myth: "N/A" 
    source_word: "Latin 'aggregatus', past participle of 'aggregare' (to add to a flock, to bring together), from 'ad-' (to) + 'grex, greg-' (flock, herd)" 
    pie_root: "**搜索工具调用：**根据搜索结果，原始印欧语(PIE)词根为 *ger- (to gather, assemble)。拉丁语词根 grex (flock) 即来源于此。" 

  visual_imagery_zh: | 
    场景: 我站在一片开阔的牧场上，夕阳西下。在我前方，羊群正三三两两地散落在山坡各处吃草。 
    动作: 我吹响口哨，向羊群中心走去，张开双臂做出驱赶的姿势。我将远处和近处的羊只，都慢慢向一个中心点聚拢。这个核心动作就是“聚集”和“归拢”。 
    体感: 我能感觉到羊只从身边跑过带起的微风，听见它们杂沓的蹄声和“咩咩”的叫声逐渐汇成一团混杂的声响。我的注意力焦点在于将分散的点状物，通过我的驱赶动作，变成一个密集的、可以整体移动的团块。 

  meaning_evolution_zh: | 
    词义演化的核心逻辑是将“把离散个体聚集为兽群”这一具体动作，隐喻为“将任何分散事物合为一体”。 
    1. 从“驱赶羊群”这一物理动作，直接引申为动词“聚集、集合”（任何事物）。 
    2. 被聚集起来的那个“整体”本身，就成了名词“集合体、总数”。在材料科学中，被聚集、混合在一起的小石块，就成了“骨料、集料”。 
    3. 形容词“聚集的、合计的”则用来描述这种“由部分构成整体”的状态或属性，从物理构成（如聚生花）延伸到抽象数据（如总成绩）。 

cognate_family: 
  instruction: "请在本板块使用中文。选择 3-4 个同源词。" 
  cognates: 
    - word: "congregate" 
      logic: "前缀'con-'（共同）+ 感受[聚集到兽群中] = （人群）聚集、集合" 
    - word: "gregarious" 
      logic: "词根本身[兽群] + 形容词后缀 = 形容（人或动物）喜欢群居的、合群的" 
    - word: "segregate" 
      logic: "前缀'se-'（分开，远离）+ 想象[从兽群中驱赶出去] = 使隔离、使分开" 
    - word: "egregious" 
      logic: "前缀'e-'（出，外）+ 视觉化物体[突出于兽群] = 原本指“出众的”，后因讽刺演变为“极坏的、骇人听闻的”" 

application: 
  selected_examples: 
    - type: "Literal / Root Image" 
      sentence: "The shepherd aggregated the scattered sheep into a tight flock." 
      translation_zh: "牧羊人将分散的羊聚集成了一个紧密的羊群。" 
    - type: "Current Context" 
      sentence: "We need to aggregate all the survey data before analysis." 
      translation_zh: "在分析之前，我们需要汇总所有的调查数据。" 
    - type: "Abstract / Metaphorical" 
      sentence: "The coarse aggregate is a key component in concrete, providing strength and volume." 
      translation_zh: "粗骨料是混凝土的关键成分，提供强度和体积。" 

nuance: 
  synonyms: 
    - word: "accumulate" 
      meaning_zh: "积累、积聚，强调逐渐增加的过程。" 
    - word: "assemble" 
      meaning_zh: "组装、集合，强调将部分组合成一个有序整体。" 
   
  image_differentiation_zh: | 
    “aggregate”的核心画面是将散落各处（如山坡上的羊）驱赶到一处，形成一个可以整体看待的团块，更强调从“分散”到“合集”的归拢过程和结果状态。 
    不同于“accumulate”（积累），它更侧重于像堆沙子一样一点一点地线性增加，画面是单向的叠加，而不一定是将已存在的分散物归拢。 
    也不同于“assemble”（组装），后者隐含了将不同部件按特定结构或功能组合起来（如组装机器），而“aggregate”的组合更为松散，各部分保持相对独立，只是物理上或统计上被合在一起看待。 
`;

const bidYaml = `yield:
  lemma: bid
  user_word: bid
  part_of_speech: verb
  syllabification: bid
  contextual_meaning:
    en: To offer a price or to make a proposal.
    zh: 出价、投标
  other_common_meanings:
    - "名词-出价: 提出的价格或报价。"
  user_context_sentence: N/A
etymology:
  root_and_affixes:
    root: Old English 'biddan'
    prefix: N/A
    suffix: N/A
    structure_analysis: 单一词根演变。
  visual_imagery_zh: |
    场景: 拍卖现场，人们举牌竞价。 ddddddddddddddddddddddddddddddddddddddddddddddddddddddddddccccccaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    动作: 我举起牌子报出自己的价格。
    体感: 竞争紧张。
  historical_origins:
    pie_root: N/A
    source_word: Old English 'biddan' (ask, pray, request)
    history_myth: N/A
  meaning_evolution_zh: |
    从“请求、祈求”发展为“出价、投标”。
cognate_family:
  cognates:
    - word: forbid
      logic: 前缀'for-'（完全）+ bid（命令/请求）= 禁止
  instruction: 请在本板块使用中文。选择 3-4 个同源词。
application:
  selected_examples:
    - type: Current Context
      sentence: She bid $300 for the painting.
      translation_zh: 她为那幅画出价300美元。
nuance:
  synonyms:
    - word: offer
      meaning_zh: 提供或提出报价。
  image_differentiation_zh: |
    “bid”强调在竞价或提案中的出价动作。 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
`;

async function addWord(word, yaml) {
  return jsonFetch(`${HOST}/api/words/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, yaml })
  });
}

async function main() {
  await deleteIfExists('aggregate');
  // await deleteIfExists('bid');

  {
    const { res, data } = await addWord('aggregate', aggregateYaml);
    const pass = res.status === 201 && data?.code === 201;
    logResult('Case1', pass);
    if (!pass) console.log(JSON.stringify(data, null, 2));
  }

  {
    const first = await addWord('bid', bidYaml);
    const second = await addWord('bid', bidYaml);
    const pass = first.res.status === 201 && second.res.status === 409 && second.data?.code === 409;
    logResult('Case2-1', first.res.status);
    logResult('Case2-2', second.res.status);
    if (!pass) {
      console.log(JSON.stringify(first.data, null, 2));
      console.log(JSON.stringify(second.data, null, 2));
    }
  }

  {
    const { res, data } = await addWord('invalid_yaml', 'yield: [bad');
    const pass = res.status === 422 && data?.code === 422;
    logResult('Case3', pass);
    if (!pass) console.log(JSON.stringify(data, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
