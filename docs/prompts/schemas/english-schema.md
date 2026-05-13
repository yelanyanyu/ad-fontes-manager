# English Word YAML Schema

```yaml
yield:
  user_word: "(Original user input)"
  lemma: "(Lemma of the word)"
  syllabification: "(Lemma syllabification)"
  user_context_sentence: "(User context sentence)"
  part_of_speech: "(Part of speech)"
  contextual_meaning:
    en: "(Definition fitting the context)"
    zh: "(简明中文定义)"
  other_common_meanings:
    - "(Meaning cluster 1)"
    - "(Meaning cluster 2)"
  language: "en"

etymology:
  root_and_affixes:
    prefix: "(Prefix or 'N/A')"
    root: "(Root morpheme)"
    suffix: "(Suffix or 'N/A')"
    structure_analysis: "(Morphological logic)"
  historical_origins:
    history_myth: "(Historical/cultural context or 'N/A')"
    source_word: "(Source language word and meaning)"
    pie_root: "(PIE root and meaning or 'N/A')"

  visual_imagery_zh: |
    (第一人称寓言场景)

  meaning_evolution_zh: |
    (词义从身体动作到抽象用法的引申路径)

cognate_family:
  cognates:
    - word: "(Cognate 1)"
      logic: "(说明同源关系)"
    - word: "(Cognate 2)"
      logic: "(说明同源关系)"
    - word: "(Cognate 3)"
      logic: "(说明同源关系)"

application:
  selected_examples:
    - type: "Literal / Root Image"
      sentence: "(Sentence)"
      translation_zh: "(中文翻译)"
    - type: "Current Context"
      sentence: "(Sentence)"
      translation_zh: "(中文翻译)"
    - type: "Abstract / Metaphorical"
      sentence: "(Sentence)"
      translation_zh: "(中文翻译)"

nuance:
  synonyms:
    - word: "(Synonym 1)"
      meaning_zh: "(中文定义)"
    - word: "(Synonym 2)"
      meaning_zh: "(中文定义)"

  image_differentiation_zh: |
    (与近义词在根词画面上的差别)
```
