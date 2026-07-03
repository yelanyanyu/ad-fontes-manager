import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { prepareYamlForWordSave } = require('./formatFix') as typeof import('./formatFix');

// 这个测试覆盖 AI 生成结果进入手动修复前的结构诊断。
// 重点是：有 root 字段时，不要把额外字段误判成 root 缺失。

void describe('prepareYamlForWordSave', () => {
  void it('reports an unsupported extra key without implying root is missing', () => {
    const result = prepareYamlForWordSave(
      'object',
      [
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
      ].join('\n')
    );

    assert.equal(result.ok, false);
    assert.ok(result.data?.etymology);
    assert.match(String(result.yaml), /root: "ject"/);
    assert.match(
      result.diagnostics.map(diagnostic => diagnostic.message).join('\n'),
      /historical_origins_alt/
    );
    assert.doesNotMatch(
      result.diagnostics.map(diagnostic => diagnostic.message).join('\n'),
      /root.*required|root.*missing/i
    );
  });
});
