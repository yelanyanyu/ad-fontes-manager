export interface WordYieldSection {
  user_word?: string;
  lemma?: string;
  syllabification?: string;
  user_context_sentence?: string;
  part_of_speech?: string;
  contextual_meaning?: {
    en?: string;
    zh?: string;
  };
  other_common_meanings?: string[];
}

export interface EtymologySection {
  root_and_affixes?: {
    prefix?: string;
    root?: string;
    suffix?: string;
    structure_analysis?: string;
  };
  historical_origins?: {
    history_myth?: string;
    source_word?: string;
    pie_root?: string;
  };
  visual_imagery_zh?: string;
  meaning_evolution_zh?: string;
}

export interface CognateItem {
  word?: string;
  logic?: string;
}

export interface ExampleItem {
  type?: string;
  sentence?: string;
  translation_zh?: string;
}

export interface SynonymItem {
  word?: string;
  meaning_zh?: string;
}

export interface WordYamlDocument {
  yield?: WordYieldSection;
  etymology?: EtymologySection;
  cognate_family?: {
    cognates?: CognateItem[];
  };
  application?: {
    selected_examples?: ExampleItem[];
  };
  nuance?: {
    synonyms?: SynonymItem[];
    image_differentiation_zh?: string;
  };
}
