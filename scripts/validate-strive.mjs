import yaml from 'js-yaml';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { EnglishWordSchema } = require('../src/server/schemas/word');

const input = `
yield:
  user_word: strive
  lemma: strive
  syllabification: strive
  user_context_sentence: She continues to strive for excellence in her work.
  part_of_speech: verb
  contextual_meaning:
    en: To make great efforts; to struggle or fight
    zh: 努力；奋斗；抗争
  other_common_meanings:
    - To try hard to achieve something
    - To contend or struggle in opposition
  language: en
etymology:
  root_and_affixes:
    prefix: N/A
    root: strive
    suffix: N/A
    structure_analysis: Verb derived from Old French, ultimately from Germanic root; no productive affixes in Modern English.
  historical_origins:
    history_myth: The word entered English via Old French estriver, which was borrowed from Frankish, a West Germanic language. It replaced earlier Old English words like 'strīdan' (to stride, strive) and 'flītan' (to strive).
    source_word: Old French 'estriver' (to quarrel, strive) < Frankish '*strīban' (to struggle, strive)
    pie_root: '*streigʰ- (to be rigid, to struggle)'
    cognates: German 'streben' (to strive), Dutch 'streven' (to strive), Gothic 'strikan' (to stroke, to go) - disputed.
  visual_imagery_zh: "测试"
  meaning_evolution_zh: "测试"
cognate_family:
  instruction: 请用中文写本板块，选择 3-4 个同源词。
  cognates:
    - word: strife
      logic: 测试
    - word: strive (noun, archaic)
      logic: 测试
    - word: streben (German)
      logic: 测试
application:
  selected_examples:
    - type: Literal / Root Image
      sentence: He strove with the rusted valve until his hands bled.
      translation_zh: 他跟那个锈死的阀门较了一下午劲，拧到手全破了皮。
    - type: Current Context
      sentence: She continues to strive for excellence in her work.
      translation_zh: 她在工作中不断追求卓越，从不松劲。
    - type: Abstract / Metaphorical
      sentence: We must strive for a more just society.
      translation_zh: 我们必须为一个更公正的社会而奋斗。
nuance:
  synonyms:
    - word: endeavor
      meaning_zh: 测试
    - word: struggle
      meaning_zh: 测试
  image_differentiation_zh: "测试"
`;

const data = yaml.load(input);
const result = EnglishWordSchema.safeParse(data);
if (result.success) {
  console.log('VALID');
} else {
  console.log('INVALID:');
  result.error.issues.forEach(i => {
    console.log('  [' + i.code + ']', i.path.join('.'), '—', i.message);
  });
}
