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

function withEnglishV2Fields(source: string): string {
  let text = source.replace(
    /(\n {2}syllabification:[^\n]+)(?!\n {2}word_forms:)/g,
    '$1\n  word_forms:\n    - base form\n    - inflected form\n    - related form'
  );

  text = text.replace(
    /(\n {4}source_word: )([^\n]+)(?!\n {6}language:)/g,
    '$1\n      language: la\n      word: $2\n      meaning: source meaning\n      relation: derived_from'
  );

  if (!/\nword_formation:/.test(text)) {
    text = `${text.trimEnd()}\nword_formation:\n  derivations:\n    - language: en\n      word: derived\n      part_of_speech: verb\n      relation: derived_from\n      logic: related formation\n`;
  }

  text = text.replace(/(\n(\s*)- word: [^\n]+)(?!\n\s+language:)/g, (_match, line, indent) => {
    const fieldIndent = `${indent}  `;
    return `${line}\n${fieldIndent}language: fr\n${fieldIndent}relation: cognate`;
  });

  return text;
}

const englishWithCreativeSectionsNestedUnderEtymology = withEnglishV2Fields(`
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
`);

const englishWithDuplicateCognateFamily = withEnglishV2Fields(`
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
`);

const englishWithAliasLikePieRoot = withEnglishV2Fields(`
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
`);

const englishWithSmartClosingQuoteInDoubleQuotedScalar = withEnglishV2Fields(`
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
`);

const englishWithSmartClosingQuoteAndNestedNuance = withEnglishV2Fields(`
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
    - word: aft
      logic: "a- + -ter 去掉比较级后还剩 aft，专指船尾。”
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
`);

const englishWithPartialSectionPromotion = withEnglishV2Fields(`
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
`);

const englishWithAliasLikePieRootAndNestedApplication = withEnglishV2Fields(`
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
  application:
    selected_examples:
      - type: daily
        sentence: He decided to abandon the plan.
        translation_zh: 他决定放弃这个计划。
cognate_family:
  cognates:
    - word: abandonner
      logic: French source form
nuance:
  image_differentiation_zh: abandon 强调主动离开
  synonyms:
    - word: desert
      meaning_zh: 遗弃
`);

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

const yamlWithRepeatedKeysInDifferentDerivationItems = `
ad_fontes:
  word_schema_version: 2
yield:
  user_word: biographer
  lemma: biographer
  syllabification: bi-og-ra-pher
  word_forms:
    - biographer
    - biographers
  user_context_sentence: The biographer spent years researching the subject's life.
  part_of_speech: noun
  contextual_meaning:
    en: a writer of an account of someone's life
    zh: 传记作者
  other_common_meanings:
    - a person who writes biographies
  language: en
etymology:
  root_and_affixes:
    prefix: bio-
    root: graph
    suffix: -er
    structure_analysis: bio plus graph plus er
  historical_origins:
    history_myth: First recorded in English in 1715.
    source_word:
      language: en
      word: biography
      meaning: account of a person's life
      relation: derived_from
    pie_root: '*gwei-'
  visual_imagery_zh: 书桌上的传记
  meaning_evolution_zh: 从生命到书写
word_formation:
  derivations:
    - language: en
      word: biography
      part_of_speech: noun
      relation: base_form
      logic: biographer is derived from biography by adding -er
    - language: en
      word: biographical
      part_of_speech: adjective
      relation: adjectivalization
      logic: biographer relates to biographical as the adjective form of biography
cognate_family:
  cognates:
    - word: biography
      language: en
      relation: cognate
      logic: bio plus graph
application:
  selected_examples:
    - type: Current Context
      sentence: The biographer spent years researching the subject's life.
      translation_zh: 传记作家花了多年研究传主的一生。
nuance:
  synonyms:
    - word: chronicler
      meaning_zh: 编年史作者
  image_differentiation_zh: biographer 写一个生命，chronicler 记录时间顺序。
`;

const yamlWithDuplicateEtymologyAfterValidDerivationItems = `
ad_fontes:
  word_schema_version: 2
yield:
  user_word: biographer
  lemma: biographer
  syllabification: bi-og-ra-pher
  word_forms:
    - biographer
  user_context_sentence: The biographer spent years researching the subject's life.
  part_of_speech: noun
  contextual_meaning:
    en: a writer of an account of someone's life
    zh: 传记作者
  other_common_meanings:
    - a person who writes biographies
  language: en
etymology:
  historical_origins:
    source_word:
      language: en
      word: biography
      meaning: account of a person's life
      relation: derived_from
    pie_root: '*gwei-'
word_formation:
  derivations:
    - language: en
      word: biography
      part_of_speech: noun
      relation: base_form
      logic: derived from biography
    - language: en
      word: biographical
      part_of_speech: adjective
      relation: adjectivalization
      logic: related adjective
etymology:
  visual_imagery_zh: 书桌上的传记
`;

const englishWithOnlyApplicationNestedUnderEtymology = withEnglishV2Fields(`
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
`);

const germanMatchingPromptSchema = `
ad_fontes:
  word_schema_version: 2
yield:
  user_word: Haus
  lemma: haus
  genus: das
  syllabification: Haus
  word_forms:
    - Häuser
    - Hauses
    - Hause
  kasus: Nominativ
  user_context_sentence: Das Haus steht am Fluss.
  part_of_speech: Nomen
  contextual_meaning:
    de: Gebäude zum Wohnen
    zh: 房子
  other_common_meanings:
    - Haushalt
  language: de
etymology:
  morphological_analysis:
    word_formation: Simplex
    components:
      - element: Haus
        type: Wortstamm
        de_meaning: Wohngebäude
    structure_analysis: Haus ist ein einfacher germanischer Stamm.
  historical_origins:
    earliest_attestation: Althochdeutsch hus
    source_word:
      language: gem-pro
      word: "*husan"
      meaning: Haus
      relation: inherited_from
    pgmc_root: '*husan'
    pie_root: N/A
    sound_changes: N/A
  visual_imagery_zh: 一座屋子挡住风雨
  meaning_evolution_zh: 从遮蔽处到家庭空间
word_formation:
  derivations:
    - language: de
      word: Haus
      part_of_speech: Nomen
      relation: base_form
      logic: Haus ist die Grundform; Häuser und häuslich stehen im selben Wortbildungsfeld.
cognate_family:
  instruction: 请用中文写本板块，选择 3-4 个日耳曼语同源词。
  cognates:
    - word: house
      language: en
      relation: cognate
      logic: 英语 house 和德语 Haus 同源，都指遮蔽居住的空间。
application:
  selected_examples:
    - type: Literal / Root Image
      sentence: Das Haus steht am Fluss.
      translation_zh: 那座房子在河边。
nuance:
  synonyms:
    - word: Gebäude
      meaning_zh: 建筑物
      connotation_difference: Gebäude 更中性，Haus 更有居住感。
  image_differentiation_zh: Haus 有家的遮蔽感，Gebäude 只是建筑轮廓。
`;

const germanWithApplicationNestedUnderEtymology = `
ad_fontes:
  word_schema_version: 2
yield:
  user_word: Haus
  lemma: haus
  genus: das
  syllabification: Haus
  word_forms:
    - Häuser
    - Hauses
    - Hause
  kasus: Nominativ
  user_context_sentence: Das Haus steht am Fluss.
  part_of_speech: Nomen
  contextual_meaning:
    de: Gebäude zum Wohnen
    zh: 房子
  other_common_meanings:
    - Haushalt
  language: de
etymology:
  morphological_analysis:
    word_formation: Simplex
    components:
      - element: Haus
        type: Wortstamm
        de_meaning: Wohngebäude
    structure_analysis: Haus ist ein einfacher germanischer Stamm.
  historical_origins:
    earliest_attestation: Althochdeutsch hus
    source_word:
      language: gem-pro
      word: "*husan"
      meaning: Haus
      relation: inherited_from
    pgmc_root: '*husan'
    pie_root: N/A
    sound_changes: N/A
  visual_imagery_zh: 一座屋子挡住风雨
  meaning_evolution_zh: 从遮蔽处到家庭空间
  application:
    selected_examples:
      - type: Literal / Root Image
        sentence: Das Haus steht am Fluss.
        translation_zh: 那座房子在河边。
  word_formation:
    derivations:
      - language: de
        word: Haus
        part_of_speech: Nomen
        relation: base_form
        logic: Haus ist die Grundform; Häuser und häuslich stehen im selben Wortbildungsfeld.
cognate_family:
  cognates:
    - word: house
      language: en
      relation: cognate
      logic: 英语 house 和德语 Haus 同源，都指遮蔽居住的空间。
nuance:
  synonyms:
    - word: Gebäude
      meaning_zh: 建筑物
      connotation_difference: Gebäude 更中性，Haus 更有居住感。
  image_differentiation_zh: Haus 有家的遮蔽感，Gebäude 只是建筑轮廓。
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
  const appMetadata = asRecord(result.data.ad_fontes);
  assert.equal(appMetadata.word_schema_version, 2);
  assert.match(result.yaml, /word_schema_version: 2/);
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

void test('Basic Format Fix rejects future Word Schema Version content', () => {
  const yamlWithFutureSchema = englishWithCreativeSectionsNestedUnderEtymology.replace(
    /^yield:/m,
    'ad_fontes:\n  word_schema_version: 999\nyield:'
  );
  const result = prepareYamlForWordSave('abandon', yamlWithFutureSchema);

  assert.equal(result.ok, false);
  assert.equal(result.canSave, false);
  assert(
    result.diagnostics.some(
      diagnostic => diagnostic.code === 'schema.unsupported_word_schema_version'
    )
  );
});

void test('English validation accepts an empty user context sentence', () => {
  const yamlWithEmptyContext = englishWithCreativeSectionsNestedUnderEtymology.replace(
    /user_context_sentence: .+/,
    'user_context_sentence: ""'
  );
  const result = prepareYamlForWordSave('abandon', yamlWithEmptyContext);

  assert.equal(result.ok, true);
  assert.equal(result.canSave, true);
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

void test('Basic Format Fix preserves smart quote repairs when structural repairs also run', () => {
  const result = prepareYamlForWordSave('after', englishWithSmartClosingQuoteAndNestedNuance);

  assert.equal(result.ok, true);
  assert(result.repairs.some(repair => repair.type === 'syntax'));
  assert(result.repairs.some(repair => repair.type === 'promote-section'));
  assert.match(result.yaml || '', /^nuance:/m);
  assert.match(result.yaml || '', /logic: "a- \+ -ter 去掉比较级后还剩 aft，专指船尾。"/);
});

void test('Basic Format Fix preserves alias-like scalar repairs when structural repairs also run', () => {
  const result = prepareYamlForWordSave('abandon', englishWithAliasLikePieRootAndNestedApplication);

  assert.equal(result.ok, true);
  assert(result.repairs.some(repair => repair.type === 'syntax'));
  assert(result.repairs.some(repair => repair.type === 'promote-section'));
  const etymology = asRecord(result.data?.etymology);
  const historicalOrigins = asRecord(etymology.historical_origins);
  assert.equal(historicalOrigins.pie_root, '*bha-');
  assert.match(result.yaml || '', /pie_root: "\*bha-"/);
  assert.match(result.yaml || '', /^application:/m);
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

void test('strict validate does not treat repeated keys in separate list items as duplicates', async () => {
  const result = await wordService.validateYaml(
    {},
    yamlWithRepeatedKeysInDifferentDerivationItems,
    { repair: false }
  );

  assert.equal(result.valid, true);
  assert.equal(
    result.diagnostics?.some(diagnostic => diagnostic.code === 'yaml.duplicate_key'),
    false
  );
  assert.equal(
    result.errors.some(error => error.includes('word_formation.derivations.language')),
    false
  );
});

void test('strict validate reports the real duplicated root section after list item keys', async () => {
  const result = await wordService.validateYaml(
    {},
    yamlWithDuplicateEtymologyAfterValidDerivationItems,
    { repair: false }
  );

  assert.equal(result.valid, false);
  assert(result.diagnostics?.some(diagnostic => diagnostic.code === 'yaml.duplicate_key'));
  assert(result.errors.some(error => error.includes('"etymology"')));
  assert.equal(
    result.errors.some(error => error.includes('word_formation.derivations.language')),
    false
  );
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
      error.includes('has a double-quoted value closed with a smart quote')
    )
  );
  assert(result.errors.some(error => error.includes('logic')));
});

void test('German validation accepts the current prompt schema without legacy top-level sections', () => {
  const result = prepareYamlForWordSave('haus', germanMatchingPromptSchema);

  assert.equal(result.ok, true);
  assert.equal(result.canSave, true);
  assert.equal(result.language, 'de');
  assert.equal(result.diagnostics.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(result.data || {}, 'dialectal_notes'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.data || {}, 'observations'), false);
  const etymology = asRecord(result.data?.etymology);
  const historicalOrigins = asRecord(etymology.historical_origins);
  const sourceWord = asRecord(historicalOrigins.source_word);
  assert.equal(sourceWord.language, 'gem-pro');
  const cognateFamily = asRecord(result.data?.cognate_family);
  const cognates = cognateFamily.cognates as Array<Record<string, unknown>>;
  assert.equal(cognates[0].language, 'en');
  assert.equal(cognates[0].relation, 'cognate');
  assert.equal(typeof result.data?.word_formation, 'object');
});

void test('Basic Format Fix promotes misplaced German root sections without legacy section diagnostics', () => {
  const result = prepareYamlForWordSave('haus', germanWithApplicationNestedUnderEtymology);

  assert.equal(result.ok, true);
  assert.equal(result.canSave, true);
  assert.equal(result.language, 'de');
  assert(result.repairs.some(repair => repair.type === 'promote-section'));
  assert.equal(result.diagnostics.length, 0);
  assert.match(result.yaml || '', /^application:/m);
  assert.match(result.yaml || '', /^word_formation:/m);
});
