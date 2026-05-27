import assert from 'node:assert/strict';
import { test } from 'node:test';

import { prepareYamlForWordSave } from '../src/server/services/word/formatFix';

const wordService = require('../src/server/services/word/WordServiceV2') as {
  validateYaml: (
    req: Record<string, unknown>,
    yaml: string,
    options?: { repair?: boolean }
  ) => Promise<{
    valid: boolean;
    errors: string[];
    yaml?: string;
    changed?: boolean;
    repairs?: Array<{ type: string }>;
    diagnostics?: Array<{ code: string }>;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

const englishWithCreativeSectionsNestedUnderEtymology = `
yield:
  user_word: abandon
  lemma: abandon
  syllabification: a-ban-don
  user_context_sentence: He decided to abandon the plan.
  part_of_speech: verb
  contextual_meaning:
    en: to leave behind
    zh: 放弃
  other_common_meanings:
    - to give up
etymology:
  root_and_affixes:
    prefix: a-
    root: band
    suffix: -on
    structure_analysis: a structure note
  historical_origins:
    history_myth: a history note
    source_word: abandonner
    pie_root: '*bha-'
  visual_imagery_zh: 一个人离开旧计划
  meaning_evolution_zh: 从交付到放弃
  cognate_family:
    cognates:
      - word: abandonner
        logic: French source form
  application:
    selected_examples:
      - type: daily
        sentence: He decided to abandon the plan.
        translation_zh: 他决定放弃这个计划。
  nuance:
    image_differentiation_zh: abandon 强调主动离开
    synonyms:
      - word: desert
        meaning_zh: 遗弃
`;

const englishWithDuplicateCognateFamily = `
yield:
  user_word: abandon
  lemma: abandon
  syllabification: a-ban-don
  user_context_sentence: He decided to abandon the plan.
  part_of_speech: verb
  contextual_meaning:
    en: to leave behind
    zh: 放弃
  other_common_meanings:
    - to give up
etymology:
  root_and_affixes:
    prefix: a-
    root: band
    suffix: -on
    structure_analysis: a structure note
  historical_origins:
    history_myth: a history note
    source_word: abandonner
    pie_root: '*bha-'
  visual_imagery_zh: 一个人离开旧计划
  meaning_evolution_zh: 从交付到放弃
  cognate_family:
    cognates:
      - word: duplicate
        logic: nested duplicate
cognate_family:
  cognates:
    - word: abandonner
      logic: canonical root section
application:
  selected_examples:
    - type: daily
      sentence: He decided to abandon the plan.
      translation_zh: 他决定放弃这个计划。
nuance:
  image_differentiation_zh: abandon 强调主动离开
  synonyms:
    - word: desert
      meaning_zh: 遗弃
`;

const englishWithAliasLikePieRoot = `
yield:
  user_word: abandon
  lemma: abandon
  syllabification: a-ban-don
  user_context_sentence: He decided to abandon the plan.
  part_of_speech: verb
  contextual_meaning:
    en: to leave behind
    zh: 放弃
  other_common_meanings:
    - to give up
etymology:
  root_and_affixes:
    prefix: a-
    root: band
    suffix: -on
    structure_analysis: a structure note
  historical_origins:
    history_myth: a history note
    source_word: abandonner
    pie_root: *bha-
  visual_imagery_zh: 一个人离开旧计划
  meaning_evolution_zh: 从交付到放弃
cognate_family:
  cognates:
    - word: abandonner
      logic: French source form
application:
  selected_examples:
    - type: daily
      sentence: He decided to abandon the plan.
      translation_zh: 他决定放弃这个计划。
nuance:
  image_differentiation_zh: abandon 强调主动离开
  synonyms:
    - word: desert
      meaning_zh: 遗弃
`;

const englishWithSmartClosingQuoteInDoubleQuotedScalar = `
yield:
  user_word: after
  lemma: after
  syllabification: af-ter
  user_context_sentence: We went to the park after lunch.
  part_of_speech: preposition
  contextual_meaning:
    en: following in time or order
    zh: 在...之后
  other_common_meanings:
    - later than
etymology:
  root_and_affixes:
    prefix: a-
    root: N/A
    suffix: -ter
    structure_analysis: more off, further away
  historical_origins:
    history_myth: N/A
    source_word: Old English æfter
    pie_root: '*ap-'
  visual_imagery_zh: 追逐的影子
  meaning_evolution_zh: 从空间落后到时间之后
cognate_family:
  cognates:
    - word: off
      logic: 从原点离开
    - word: aft
      logic: "a- + -ter 去掉比较级后还剩 aft，专指船尾。”
    - word: ter
      logic: "*-ter-”
application:
  selected_examples:
    - type: Literal / Root Image
      sentence: He ran after the bus.
      translation_zh: 他追赶公共汽车。
nuance:
  synonyms:
    - word: behind
      meaning_zh: 在后面
  image_differentiation_zh: after 是追，behind 是静止位置
`;

const englishWithPartialSectionPromotion = `
yield:
  user_word: abandon
  lemma: abandon
  syllabification: a-ban-don
  user_context_sentence: He decided to abandon the plan.
  part_of_speech: verb
  contextual_meaning:
    en: to leave behind
    zh: 放弃
  other_common_meanings:
    - to give up
etymology:
  root_and_affixes:
    prefix: a-
    root: band
    suffix: -on
    structure_analysis: a structure note
  historical_origins:
    history_myth: a history note
    source_word: abandonner
    pie_root: '*bha-'
  visual_imagery_zh: 一个人离开旧计划
  meaning_evolution_zh: 从交付到放弃
  cognate_family:
    cognates:
      - word: abandonner
        logic: French source form
nuance:
  image_differentiation_zh: abandon 强调主动离开
  synonyms:
    - word: desert
      meaning_zh: 遗弃
`;

const yamlWithBadIndentation = `
yield:
  lemma: drive
cognate_family:
  cognates:
    - word: "drive"
      logic: "direct root"
       - word: "draft"
      logic: "bad indentation"
`;

const yamlWithDuplicateTopLevelEtymology = `
yield:
  lemma: vanish
etymology:
  historical_origins:
    pie_root: "*wā-"
etymology:
  visual_imagery_zh: 变空
`;

const englishWithOnlyApplicationNestedUnderEtymology = `
yield:
  user_word: compelling
  lemma: compelling
  syllabification: com-pel-ling
  user_context_sentence: The evidence was compelling.
  part_of_speech: adjective
  contextual_meaning:
    en: very convincing
    zh: 令人信服的
  other_common_meanings:
    - irresistible
etymology:
  root_and_affixes:
    prefix: com-
    root: pel
    suffix: '-ing'
    structure_analysis: compelling is formed from compel plus -ing
  historical_origins:
    history_myth: N/A
    source_word: Latin compellere
    pie_root: '*pel-'
  visual_imagery_zh: 驱赶之力
  meaning_evolution_zh: 从驱赶到信服
  application:
    selected_examples:
      - type: Current Context
        sentence: The evidence was compelling.
        translation_zh: 这份证据令人信服。
cognate_family:
  cognates:
    - word: compel
      logic: com- plus pel
nuance:
  synonyms:
    - word: convincing
      meaning_zh: 令人相信
  image_differentiation_zh: compelling 带有驱赶感
`;

void test('Basic Format Fix promotes misplaced English root sections and returns saveable YAML', () => {
  const result = prepareYamlForWordSave('abandon', englishWithCreativeSectionsNestedUnderEtymology);

  assert.equal(result.ok, true);
  assert.equal(result.canSave, true);
  assert.equal(result.changed, true);
  assert.equal(result.language, 'en');
  assert.equal(result.diagnostics.length, 0);
  assert(result.yaml);
  assert(result.data);
  assert.deepEqual(
    result.repairs.map(repair => repair.type),
    ['promote-section', 'promote-section', 'promote-section']
  );

  assert.equal(typeof result.data.cognate_family, 'object');
  assert.equal(typeof result.data.application, 'object');
  assert.equal(typeof result.data.nuance, 'object');
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.data.etymology as Record<string, unknown>,
      'nuance'
    ),
    false
  );
});

void test('Basic Format Fix reports duplicate sections instead of overwriting root content', () => {
  const result = prepareYamlForWordSave('abandon', englishWithDuplicateCognateFamily);

  assert.equal(result.ok, false);
  assert.equal(result.canSave, false);
  const cognateFamily = asRecord(result.data?.cognate_family);
  const cognates = cognateFamily.cognates as Array<Record<string, unknown>>;
  assert.equal(cognates[0].word, 'abandonner');
  assert(result.diagnostics.some(diagnostic => diagnostic.code === 'section.duplicate'));
  assert.equal(
    result.repairs.some(repair => repair.to === 'cognate_family'),
    false
  );
});

void test('Basic Format Fix repairs alias-like root values before parsing', () => {
  const result = prepareYamlForWordSave('abandon', englishWithAliasLikePieRoot);

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const etymology = asRecord(result.data?.etymology);
  const historicalOrigins = asRecord(etymology.historical_origins);
  assert.equal(historicalOrigins.pie_root, '*bha-');
  assert(result.repairs.some(repair => repair.type === 'syntax'));
  assert.match(result.yaml || '', /pie_root: ['"]\*bha-['"]/);
});

void test('Basic Format Fix repairs smart closing quote in double-quoted YAML scalar', () => {
  const result = prepareYamlForWordSave('after', englishWithSmartClosingQuoteInDoubleQuotedScalar);

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert(result.repairs.some(repair => repair.type === 'syntax'));
  const cognateFamily = asRecord(result.data?.cognate_family);
  const cognates = cognateFamily.cognates as Array<Record<string, unknown>>;
  assert.equal(cognates[1].logic, 'a- + -ter 去掉比较级后还剩 aft，专指船尾。');
  assert.equal(cognates[2].logic, '*-ter-');
  assert.match(result.yaml || '', /logic: "a- \+ -ter 去掉比较级后还剩 aft，专指船尾。"/);
  assert.match(result.yaml || '', /logic: "\*-ter-"/);
});

void test('validateYaml runs Basic Format Fix and returns repaired YAML details', async () => {
  const result = await wordService.validateYaml(
    {},
    englishWithCreativeSectionsNestedUnderEtymology
  );

  assert.equal(result.valid, true);
  assert.equal(result.changed, true);
  assert(result.yaml);
  assert.equal(result.diagnostics?.length, 0);
  assert.deepEqual(
    result.repairs?.map(repair => repair.type),
    ['promote-section', 'promote-section', 'promote-section']
  );
});

void test('validateYaml returns partially repaired YAML when Basic Format Fix cannot make it saveable', async () => {
  const result = await wordService.validateYaml({}, englishWithPartialSectionPromotion);

  assert.equal(result.valid, false);
  assert.equal(result.changed, true);
  assert(result.yaml);
  assert(result.yaml.includes('cognate_family:'));
  assert(result.repairs?.some(repair => repair.type === 'promote-section'));
  assert(result.diagnostics?.some(diagnostic => diagnostic.code === 'section.missing'));
});

void test('validateYaml returns editable YAML when indentation errors prevent parsing', async () => {
  const result = await wordService.validateYaml({}, yamlWithBadIndentation);

  assert.equal(result.valid, false);
  assert.equal(result.changed, false);
  assert(result.yaml);
  assert(result.yaml.includes('logic: "bad indentation"'));
  assert(result.diagnostics?.some(diagnostic => diagnostic.code === 'yaml.parse_error'));
});

void test('validateYaml can validate the current YAML without applying Basic Format Fix', async () => {
  const result = await wordService.validateYaml(
    {},
    englishWithCreativeSectionsNestedUnderEtymology,
    { repair: false }
  );

  assert.equal(result.valid, false);
  assert.equal(result.changed, false);
  assert.equal(result.repairs?.length, 0);
  assert(result.diagnostics?.some(diagnostic => diagnostic.code === 'schema.invalid'));
});

void test('strict validate reports current YAML invalid when application is only nested under etymology', async () => {
  const result = await wordService.validateYaml(
    {},
    englishWithOnlyApplicationNestedUnderEtymology,
    { repair: false }
  );

  assert.equal(result.valid, false);
  assert.equal(result.changed, false);
  assert(result.errors.some(error => error.includes('application')));
});

void test('strict validate reports duplicate YAML key with first and duplicate line numbers', async () => {
  const result = await wordService.validateYaml({}, yamlWithDuplicateTopLevelEtymology, {
    repair: false,
  });

  assert.equal(result.valid, false);
  assert(result.diagnostics?.some(diagnostic => diagnostic.code === 'yaml.duplicate_key'));
  assert(result.errors.some(error => error.includes('"etymology"')));
  assert(result.errors.some(error => error.includes('line 4')));
  assert(result.errors.some(error => error.includes('line 7')));
});

void test('strict validate points unclosed double quote diagnostics at the scalar line', async () => {
  const result = await wordService.validateYaml(
    {},
    englishWithSmartClosingQuoteInDoubleQuotedScalar,
    { repair: false }
  );

  assert.equal(result.valid, false);
  assert(result.diagnostics?.some(diagnostic => diagnostic.code === 'yaml.unclosed_quote'));
  assert(
    result.errors.some(error =>
      error.includes('Line 30 has a double-quoted value closed with a smart quote')
    )
  );
  assert(result.errors.some(error => error.includes('logic')));
});
