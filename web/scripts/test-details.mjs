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

async function seedBolster() {
  const yaml = `yield:
  lemma: bolster
  syllabification: bol-ster
  other_common_meanings:
    - 支撑
    - 加强
nuance:
  image_differentiation_zh: 画面感辨析
  synonyms:
    - word: strengthen
      meaning_zh: 加强
application:
  selected_examples:
    - type: Current Context
      sentence: We must bolster our defenses.
      translation_zh: 我们必须加强防御。
cognate_family:
  cognates:
    - word: ball
      logic: 同源圆形根
etymology:
  root_and_affixes:
    prefix: bo-
    root: bolst
    suffix: -er
    structure_analysis: 前缀+词根+后缀
  historical_origins:
    history_myth: 词源故事
    source_word: Old English
    pie_root: "*bhel-"
  visual_imagery_zh: 画面感叙事
  meaning_evolution_zh: 含义演变逻辑链
`;
  const { res, data, text } = await jsonFetch(`${HOST}/api/words`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yaml, forceUpdate: true })
  });
  if (!res.ok) {
    throw new Error(`Seed failed: ${res.status} ${text}`);
  }
  return data;
}

async function main() {
  try {
    await seedBolster();
  } catch (e) {
    console.error('Seed error:', e.message);
    process.exit(1);
  }

  {
    const { res, data } = await jsonFetch(`${HOST}/api/words/details?word=bolster`);
    const d = data?.data || {};
    const pass =
      res.status === 200 &&
      data?.code === 200 &&
      !!d.lemma &&
      !!d.syllabification &&
      d.etymology === undefined &&
      d.cognates === undefined &&
      d.examples === undefined &&
      d.synonyms === undefined &&
      d.original_yaml === undefined;
    logResult('Case1', pass);
    if (!pass) {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  }

  {
    const { res, data } = await jsonFetch(`${HOST}/api/words/details?word=bolster&include=etymology,cognates,examples,synonyms,rawyaml`);
    const d = data?.data || {};
    const pass =
      res.status === 200 &&
      data?.code === 200 &&
      Array.isArray(d.examples) &&
      d.examples.length > 0 &&
      !!d.examples[0]?.sentence;
    logResult('Case2', pass);
    if (!pass) {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  }

  {
    const { res, data, text } = await jsonFetch(`${HOST}/api/words/details?word=not_exist_word`);
    const pass = res.status === 404 && data?.code === 404;
    logResult('Case3', pass, `(status=${res.status})`);
    if (!pass) {
      console.log('Body:', text);
    }
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
