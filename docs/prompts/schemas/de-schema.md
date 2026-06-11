# German Word YAML Schema

```yaml
ad_fontes:
  word_schema_version: 2

yield:
  user_word: "(Original user input with case/gender as given)"
  lemma: "(Dictionary form: Infinitive for verbs, Nominativ Singular for nouns)"
  genus: "(der/die/das for nouns, otherwise 'N/A')"
  syllabification: "(Syllable division respecting German phonology)"
  kasus: "(Case in context: Nominativ/Akkusativ/Dativ/Genitiv, if applicable)"
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
    earliest_attestation: "(OHG/MHG/Early NHG period)"
    source_form: "(PGmc/OHG/MHG form and meaning)"
    pgmc_root: "(Proto-Germanic root or 'N/A')"
    pie_root: "(PIE root or 'N/A')"
    sound_changes: "(Key sound shifts or 'N/A')"

  visual_imagery_zh: |
    (第一人称寓言场景)

  meaning_evolution_zh: |
    (词义从德语空间/动作到抽象用法的引申路径)

cognate_family:
  cognates:
    - word: "(Germanic cognate 1)"
      german_equivalent: "(对应的德语词)"
      logic: "(说明同源关系)"
    - word: "(Germanic cognate 2)"
      german_equivalent: "(对应的德语词)"
      logic: "(说明同源关系)"
    - word: "(Germanic cognate 3)"
      german_equivalent: "(对应的德语词)"
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
