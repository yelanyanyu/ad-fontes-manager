# German Word YAML Schema

```yaml
ad_fontes:
  word_schema_version: 2

yield:
  user_word: "(Original user input with case/gender as given)"
  lemma: "(Dictionary form: Infinitive for verbs, Nominativ Singular for nouns)"
  genus: "(der/die/das for nouns, otherwise 'N/A')"
  syllabification: "(Syllable division respecting German phonology)"
  word_forms: ["(Inflected form 1)", "(Inflected form 2)", "(Inflected form 3)"]
  kasus: "(Case in context: Nominativ/Akkusativ/Dativ/Genitiv, if applicable; otherwise 'N/A')"
  user_context_sentence: "(User context sentence; may be empty string if none)"
  part_of_speech: "(Wortart: Verb/Nomen/Adjektiv/Adverb/etc.)"
  contextual_meaning:
    de: "(Definition fitting the German context)"
    zh: "(简明中文定义)"
  other_common_meanings:
    - "(Cluster 1)"
    - "(Cluster 2)"
  language: "de"

etymology:
  morphological_analysis:
    word_formation: "(Kompositum / Derivatum / Ablautreihe / Conversion)"
    components:
      - element: "(Component)"
        type: "(Präfix/Wortstamm/Suffix/etc.)"
        de_meaning: "(German meaning)"
    structure_analysis: "(Morphological logic)"

  historical_origins:
    earliest_attestation: "(OHG/MHG/Early NHG period or 'N/A')"
    source_word:
      language: "(Source language code, e.g. gmh, goh, gem-pro, la, grc, fr, N/A)"
      word: "(Source form or 'N/A')"
      meaning: "(Meaning of the source form or 'N/A')"
      relation: "(inherited_from / borrowed_from / derived_from / related_to / N/A)"
    pgmc_root: "(Proto-Germanic root and meaning or 'N/A')"
    pie_root: "(PIE root and meaning or 'N/A')"
    sound_changes: "(Key sound shifts or 'N/A')"

  visual_imagery_zh: |
    (第一人称寓言场景)

  meaning_evolution_zh: |
    (词义从德语空间/动作到抽象用法的引申路径)

word_formation:
  derivations:
    - language: "(Language code, e.g. de)"
      word: "(Derived or related lemma)"
      part_of_speech: "(Part of speech)"
      relation: "(nominalization / verbalization / adjectivalization / adverbialization / derived_from / base_form / compound_related)"
      logic: "(说明构词关系)"

cognate_family:
  cognates:
    - word: "(Cognate 1)"
      language: "(Language code, e.g. en, nl, sv, no, da, is, goh, gmh)"
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
      sentence: "(German sentence)"
      translation_zh: "(中文翻译)"
    - type: "Current Context"
      sentence: "(German sentence)"
      translation_zh: "(中文翻译)"
    - type: "Abstract / Metaphorical"
      sentence: "(German sentence)"
      translation_zh: "(中文翻译)"

nuance:
  synonyms:
    - word: "(German synonym 1)"
      meaning_zh: "(中文定义)"
      connotation_difference: "(语义色彩)"
    - word: "(German synonym 2)"
      meaning_zh: "(中文定义)"
      connotation_difference: "(语义色彩)"

  image_differentiation_zh: |
    (与近义词在根词画面或方向性上的差别)
```
