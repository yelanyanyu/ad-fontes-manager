interface FieldMap {
  db: string;
  source: string;
}

interface TableConfig {
  table: string;
  fields: FieldMap[];
  isArray: boolean;
  getData: (
    data: Record<string, any>
  ) => Record<string, unknown> | Array<Record<string, unknown>> | null;
}

interface DbClientLike {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

interface WordData {
  lemma?: string;
  syllabification?: string;
  partOfSpeech?: string;
  contextualMeaningEn?: string;
  contextualMeaningZh?: string;
  otherCommonMeanings: unknown[];
  imageDifferentiationZh?: string;
  originalYaml: Record<string, unknown>;
}

interface UserContextData {
  userWord?: string;
  userContext?: string;
}

class WordAssembler {
  private readonly _subTableConfigs: TableConfig[];

  constructor() {
    this._subTableConfigs = [
      {
        table: 'etymologies',
        fields: [
          { db: 'prefix', source: 'etymology.root_and_affixes.prefix' },
          { db: 'root', source: 'etymology.root_and_affixes.root' },
          { db: 'suffix', source: 'etymology.root_and_affixes.suffix' },
          { db: 'structure_analysis', source: 'etymology.root_and_affixes.structure_analysis' },
          { db: 'history_myth', source: 'etymology.historical_origins.history_myth' },
          { db: 'source_word', source: 'etymology.historical_origins.source_word' },
          { db: 'pie_root', source: 'etymology.historical_origins.pie_root' },
          { db: 'visual_imagery_zh', source: 'etymology.visual_imagery_zh' },
          { db: 'meaning_evolution_zh', source: 'etymology.meaning_evolution_zh' },
        ],
        isArray: false,
        getData: (data: Record<string, any>) => {
          const etym = data.etymology || {};
          const roots = etym.root_and_affixes || {};
          const origins = etym.historical_origins || {};
          if (!roots.prefix && !roots.root && !roots.suffix) return null;
          return {
            prefix: roots.prefix,
            root: roots.root,
            suffix: roots.suffix,
            structure_analysis: roots.structure_analysis,
            history_myth: origins.history_myth,
            source_word: origins.source_word,
            pie_root: origins.pie_root,
            visual_imagery_zh: etym.visual_imagery_zh,
            meaning_evolution_zh: etym.meaning_evolution_zh,
          };
        },
      },
      {
        table: 'cognates',
        fields: [
          { db: 'cognate_word', source: 'word' },
          { db: 'logic', source: 'logic' },
        ],
        isArray: true,
        getData: (data: Record<string, any>) => {
          const cognates = data.cognate_family?.cognates || [];
          return cognates
            .filter((c: Record<string, unknown>) => c.word)
            .map((c: Record<string, unknown>) => ({
              word: c.word,
              logic: c.logic,
            }));
        },
      },
      {
        table: 'examples',
        fields: [
          { db: 'example_type', source: 'type' },
          { db: 'sentence', source: 'sentence' },
          { db: 'translation_zh', source: 'translation_zh' },
        ],
        isArray: true,
        getData: (data: Record<string, any>) => {
          const examples = data.application?.selected_examples || [];
          return examples
            .filter((e: Record<string, unknown>) => e.sentence)
            .map((e: Record<string, unknown>) => ({
              example_type: e.type,
              sentence: e.sentence,
              translation_zh: e.translation_zh,
            }));
        },
      },
      {
        table: 'synonyms',
        fields: [
          { db: 'synonym_word', source: 'word' },
          { db: 'meaning_zh', source: 'meaning_zh' },
        ],
        isArray: true,
        getData: (data: Record<string, any>) => {
          const synonyms = data.nuance?.synonyms || [];
          return synonyms
            .filter((s: Record<string, unknown>) => s.word)
            .map((s: Record<string, unknown>) => ({
              word: s.word,
              meaning_zh: s.meaning_zh,
            }));
        },
      },
    ];
  }

  async updateChildren(
    client: DbClientLike,
    wordId: string | number,
    data: Record<string, any>
  ): Promise<void> {
    await this._clearChildren(client, wordId);
    await this._insertChildren(client, wordId, data);
  }

  private async _clearChildren(client: DbClientLike, wordId: string | number): Promise<void> {
    const tables = ['etymologies', 'cognates', 'examples', 'synonyms'];
    const deletePromises = tables.map(table =>
      client.query(`DELETE FROM ${table} WHERE word_id = $1`, [wordId])
    );
    await Promise.all(deletePromises);
  }

  private async _insertChildren(
    client: DbClientLike,
    wordId: string | number,
    data: Record<string, any>
  ): Promise<void> {
    const insertPromises: Array<Promise<void>> = [];

    for (const config of this._subTableConfigs) {
      const items = config.getData(data);
      if (!items) continue;

      if (config.isArray) {
        for (const item of items as Array<Record<string, unknown>>) {
          insertPromises.push(this._insertSingle(client, wordId, config, item));
        }
      } else {
        insertPromises.push(
          this._insertSingle(client, wordId, config, items as Record<string, unknown>)
        );
      }
    }

    await Promise.all(insertPromises);
  }

  private async _insertSingle(
    client: DbClientLike,
    wordId: string | number,
    config: TableConfig,
    item: Record<string, unknown>
  ): Promise<void> {
    const dbFields = config.fields.map(f => f.db);
    const placeholders = dbFields.map((_, i) => `$${i + 2}`).join(', ');
    const values = config.fields.map(f => item[f.source] ?? null);

    const sql = `
      INSERT INTO ${config.table} (word_id, ${dbFields.join(', ')})
      VALUES ($1, ${placeholders})
    `;

    await client.query(sql, [wordId, ...values]);
  }

  extractWordData(data: Record<string, any>): WordData {
    const yieldData = data.yield || {};
    const nuanceData = data.nuance || {};

    return {
      lemma: yieldData.lemma,
      syllabification: yieldData.syllabification,
      partOfSpeech: yieldData.part_of_speech,
      contextualMeaningEn: yieldData.contextual_meaning?.en,
      contextualMeaningZh: yieldData.contextual_meaning?.zh,
      otherCommonMeanings: yieldData.other_common_meanings || [],
      imageDifferentiationZh: nuanceData.image_differentiation_zh,
      originalYaml: data,
    };
  }

  extractUserContext(data: Record<string, any>): UserContextData {
    const yieldData = data.yield || {};
    return {
      userWord: yieldData.user_word,
      userContext: yieldData.user_context_sentence,
    };
  }
}

module.exports = new WordAssembler();
