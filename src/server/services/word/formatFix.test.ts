import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { prepareYamlForWordSave } = require('./formatFix') as typeof import('./formatFix');
const wordServiceV2 = require('./WordServiceV2') as {
  validateYaml: (
    req: Record<string, unknown>,
    yamlStr: string,
    options?: { repair?: boolean }
  ) => Promise<{
    valid: boolean;
    errors: string[];
    diagnostics?: Array<{
      anchorPath?: string;
      candidatePath?: string;
      code?: string;
      kind?: string;
      line?: number;
      message?: string;
      path?: string;
      suggestion?: string;
    }>;
  }>;
};

// 这个测试覆盖 AI 生成结果进入手动修复前的结构诊断。
// 重点是：有 root 字段时，不要把额外字段误判成 root 缺失。

function objectWithExtraHistoricalOriginsAltYaml(): string {
  return [
    'ad_fontes:',
    '  word_schema_version: 2',
    'yield:',
    '  user_word: "object"',
    '  lemma: "object"',
    '  syllabification: "ob·ject"',
    '  word_forms:',
    '    - "object"',
    '  user_context_sentence: "The witness could not identify the small object."',
    '  part_of_speech: "noun"',
    '  contextual_meaning:',
    '    en: "A material thing that can be seen and touched."',
    '    zh: "物体；物品"',
    '  other_common_meanings:',
    '    - "A goal or purpose"',
    '  language: "en"',
    'etymology:',
    '  root_and_affixes:',
    '    prefix: "ob-"',
    '    root: "ject"',
    '    suffix: "N/A"',
    '    structure_analysis: "ob- plus ject"',
    '  historical_origins:',
    '    history_myth: "Medieval Latin obiectum."',
    '    source_word:',
    '      language: "la"',
    '      word: "obiectum"',
    '      meaning: "object"',
    '      relation: "borrowed_from"',
    '    pie_root: "*(H)yeh₁-"',
    '  visual_imagery_zh: "抛来的物"',
    '  meaning_evolution_zh: "从被抛到眼前的东西，走到可触摸的物体。"',
    '  historical_origins_alt:',
    '    - note: "extra note"',
    'word_formation:',
    '  derivations:',
    '    - language: "en"',
    '      word: "objection"',
    '      part_of_speech: "noun"',
    '      relation: "derived_from"',
    '      logic: "object plus suffix"',
    'cognate_family:',
    '  cognates:',
    '    - word: "reject"',
    '      language: "en"',
    '      relation: "cognate"',
    '      logic: "same root"',
    'application:',
    '  selected_examples:',
    '    - type: "Current Context"',
    '      sentence: "The witness could not identify the small object."',
    '      translation_zh: "目击者无法辨认那个小物体。"',
    'nuance:',
    '  synonyms:',
    '    - word: "thing"',
    '      meaning_zh: "东西"',
    '  image_differentiation_zh: "object 更正式"',
  ].join('\n');
}

function objectWithMalformedHistoricalOriginsKeyYaml(): string {
  return objectWithExtraHistoricalOriginsAltYaml()
    .replace('  historical_origins:', '  historical_origins:abc:')
    .replace('  historical_origins_alt:\n    - note: "extra note"\n', '');
}

function objectWithUnindentedBlockScalarLineYaml(): string {
  return objectWithExtraHistoricalOriginsAltYaml()
    .replace(
      '  visual_imagery_zh: "抛来的物"',
      '  visual_imagery_zh: |\n    潮声\n潮退去时，那只手套留在沙滩上。'
    )
    .replace('  historical_origins_alt:\n    - note: "extra note"\n', '');
}

function objectWithFirstBlockScalarLineUnindentedYaml(): string {
  return objectWithExtraHistoricalOriginsAltYaml()
    .replace(
      '  visual_imagery_zh: "抛来的物"',
      '  visual_imagery_zh: |\n潮声\n  meaning_evolution_zh: "后来变成对象。"'
    )
    .replace('  meaning_evolution_zh: "被扔到面前的东西"', '')
    .replace('  historical_origins_alt:\n    - note: "extra note"\n', '');
}

void describe('prepareYamlForWordSave', () => {
  void it('reports an unsupported extra key without implying root is missing', () => {
    const result = prepareYamlForWordSave('object', objectWithExtraHistoricalOriginsAltYaml());

    assert.equal(result.ok, false);
    assert.ok(result.data?.etymology);
    assert.match(String(result.yaml), /root: "ject"/);
    assert.ok(
      result.diagnostics.some(diagnostic => diagnostic.path === 'etymology.historical_origins_alt')
    );
    assert.match(
      result.diagnostics.map(diagnostic => diagnostic.message).join('\n'),
      /historical_origins_alt/
    );
    assert.doesNotMatch(
      result.diagnostics.map(diagnostic => diagnostic.message).join('\n'),
      /root.*required|root.*missing/i
    );
  });

  void it('keeps the precise schema path when validation runs without repair', async () => {
    const result = await wordServiceV2.validateYaml({}, objectWithExtraHistoricalOriginsAltYaml(), {
      repair: false,
    });

    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ['Unrecognized key: "historical_origins_alt"']);
    assert.ok(
      result.diagnostics?.some(diagnostic => diagnostic.path === 'etymology.historical_origins_alt')
    );
  });

  void it('prioritizes malformed near-match keys over the missing field they cause', () => {
    const result = prepareYamlForWordSave('object', objectWithMalformedHistoricalOriginsKeyYaml());

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.kind, 'malformed_key_candidate');
    assert.equal(result.diagnostics[0]?.path, 'etymology.historical_origins:abc');
    assert.equal(result.diagnostics[0]?.anchorPath, 'etymology.historical_origins:abc');
    assert.equal(result.diagnostics[0]?.candidatePath, 'etymology.historical_origins');
    assert.match(String(result.diagnostics[0]?.suggestion), /historical_origins/);
  });

  void it('keeps malformed key guidance when validation runs without repair', async () => {
    const result = await wordServiceV2.validateYaml(
      {},
      objectWithMalformedHistoricalOriginsKeyYaml(),
      { repair: false }
    );

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics?.[0]?.kind, 'malformed_key_candidate');
    assert.equal(result.diagnostics?.[0]?.anchorPath, 'etymology.historical_origins:abc');
    assert.equal(result.diagnostics?.[0]?.candidatePath, 'etymology.historical_origins');
  });

  void it('points block scalar indentation parse errors at the unindented text line', () => {
    const result = prepareYamlForWordSave('object', objectWithUnindentedBlockScalarLineYaml());

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, 'yaml.block_scalar_indent');
    assert.equal(result.diagnostics[0]?.path, 'etymology.visual_imagery_zh');
    assert.equal(result.diagnostics[0]?.line, 33);
    assert.match(String(result.diagnostics[0]?.message), /visual_imagery_zh/);
    assert.match(String(result.diagnostics[0]?.suggestion), /缩进/);
  });

  void it('explains first block scalar text line indentation without referring to previous text', () => {
    const result = prepareYamlForWordSave('object', objectWithFirstBlockScalarLineUnindentedYaml());

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, 'yaml.block_scalar_indent');
    assert.equal(result.diagnostics[0]?.line, 32);
    assert.match(String(result.diagnostics[0]?.suggestion), /字段名/);
    assert.doesNotMatch(String(result.diagnostics[0]?.suggestion), /上一行正文/);
  });

  void it('keeps block scalar indentation guidance when validation runs without repair', async () => {
    const result = await wordServiceV2.validateYaml({}, objectWithUnindentedBlockScalarLineYaml(), {
      repair: false,
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics?.[0]?.code, 'yaml.block_scalar_indent');
    assert.equal(result.diagnostics?.[0]?.line, 33);
  });
});
