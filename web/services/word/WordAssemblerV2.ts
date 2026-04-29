interface WordInputData {
  yield?: {
    lemma?: string;
    part_of_speech?: string;
    user_word?: string;
    user_context_sentence?: string;
  };
  [key: string]: unknown;
}

interface WordDataV2 {
  lemma?: string;
  language: string;
  partOfSpeech?: string;
  content: Record<string, unknown>;
}

interface UserContextV2 {
  userWord?: string;
  userContext?: string;
}

class WordAssemblerV2 {
  extractWordData(data: WordInputData, language: string): WordDataV2 {
    const yieldData = data.yield || {};

    return {
      lemma: yieldData.lemma,
      language,
      partOfSpeech: yieldData.part_of_speech,
      content: data as Record<string, unknown>,
    };
  }

  extractUserContext(data: WordInputData): UserContextV2 {
    const yieldData = data.yield || {};
    return {
      userWord: yieldData.user_word,
      userContext: yieldData.user_context_sentence,
    };
  }
}

module.exports = new WordAssemblerV2();
