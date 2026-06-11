# English Word YAML Schema

```yaml
ad_fontes:
  word_schema_version: 2

yield:
  user_word: "(Original user input)"
  lemma: "(Lemma of the word)"
  syllabification: "(Lemma syllabification)"
  word_forms: ["(Inflected form 1)", "(Inflected form 2)", "(Inflected form 3)"]
  user_context_sentence: "(User context sentence; may be empty string if none)"
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
    source_word:
      language: "(Source language code, e.g. la, grc, oe, fr, N/A)"
      word: "(Source word or 'N/A')"
      meaning: "(Meaning of the source word or 'N/A')"
      relation: "(borrowed_from / inherited_from / derived_from / related_to / N/A)"
    pie_root: "(PIE root and meaning or 'N/A')"

  visual_imagery_zh: |
    (第一人称寓言场景)

  meaning_evolution_zh: |
    (词义从身体动作到抽象用法的引申路径)

word_formation:
  derivations:
    - language: "(Language code, e.g. en)"
      word: "(Derived or related lemma)"
      part_of_speech: "(Part of speech)"
      relation: "(nominalization / verbalization / adjectivalization / adverbialization / derived_from / base_form)"
      logic: "(说明构词关系)"

cognate_family:
  cognates:
    - word: "(Cognate 1)"
      language: "(Language code, e.g. en, fr, de, es, it)"
      relation: "cognate"
      logic: "(说明同源关系)"
    - word: "(Cognate 2)"
      language: "(Language code)"
      relation: "cognate"
      logic: "(说明同源关系)"
    - word: "(Cognate 3)"
      language: "(Language code)"
      relation: "cognate"
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
