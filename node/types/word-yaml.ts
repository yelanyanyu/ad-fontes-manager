// ==============================================================================
// Shared Types
// ==============================================================================

export type LanguageCode = 'en' | 'de';

// ==============================================================================
// English YAML Types (existing, unchanged)
// ==============================================================================

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

// ==============================================================================
// German YAML Types (new)
// ==============================================================================

export interface GermanWordYieldSection {
  user_word?: string;
  lemma?: string;
  genus?: string;            // der/die/das/N/A
  syllabification?: string;
  kasus?: string;            // Nominativ/Akkusativ/Dativ/Genitiv/N/A
  user_context_sentence?: string;
  part_of_speech?: string;
  contextual_meaning?: {
    de?: string;
    zh?: string;
  };
  other_common_meanings?: string[];
}

export interface MorphologicalComponent {
  element: string;
  type: string;              // Präfix / Wortstamm/Grundwort / Suffix
  de_meaning: string;
  trennbar?: boolean;
  ablaut_grade?: string;
}

export interface MorphologicalAnalysis {
  word_formation: string;    // Kompositum / Derivatum / Ablautreihe / Conversion
  components: MorphologicalComponent[];
  structure_analysis: string;
}

export interface HistoricalPhonology {
  pie_root?: string;
  proto_germanic?: string;
  grimm_step?: string;
  verner_law?: string;
  old_high_german?: string;
  consonant_shift?: string;
  middle_high_german?: string;
}

export interface HistoricalSemantics {
  proto_meaning?: string;
  semantic_shifts?: string;
}

export interface GermanEtymologySection {
  morphological_analysis?: MorphologicalAnalysis;
  historical_origins?: {
    earliest_attestation?: string;
    source_form?: string;
    pgmc_root?: string;
    pie_root?: string;
    sound_changes?: string;
  };
  historical_phonology?: HistoricalPhonology;
  historical_semantics?: HistoricalSemantics;
  visual_imagery_zh?: string;
  meaning_evolution_zh?: string;
}

export interface GermanCognateItem {
  word?: string;
  german_equivalent?: string;
  logic?: string;
}

export interface GermanSynonymItem {
  word?: string;
  meaning_zh?: string;
  connotation_difference?: string;
}

export interface DialectalNotes {
  low_german?: string;
  alemanic_bavarian?: string;
  yiddish?: string;
}

export interface GermanObservations {
  register?: string;
  false_friends?: string;
  calque_status?: string;
}

export interface GermanWordYamlDocument {
  yield?: GermanWordYieldSection;
  etymology?: GermanEtymologySection;
  cognate_family?: {
    instruction?: string;
    cognates?: GermanCognateItem[];
  };
  application?: {
    selected_examples?: ExampleItem[];
  };
  nuance?: {
    synonyms?: GermanSynonymItem[];
    image_differentiation_zh?: string;
    germanic_differentiation_zh?: string;
  };
  dialectal_notes?: DialectalNotes;
  observations?: GermanObservations;
}

// ==============================================================================
// Union type for language-agnostic handling
// ==============================================================================

export type AnyWordYamlDocument = WordYamlDocument | GermanWordYamlDocument;
