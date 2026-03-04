/**
 * ============================================================================
 * WordAssembler - 词汇实体组装器（Data Mapper Pattern）
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是词汇管理系统的数据转换与实体组装层，负责 YAML 数据结构与数据库
 * 表结构之间的双向映射。作为连接外部数据格式（YAML）与内部存储模型的桥梁，
 * 它将复杂的嵌套 YAML 对象转换为适合数据库存储的扁平化结构，同时管理词汇
 * 与其关联子表（词源、同源词、例句、近义词）之间的数据同步。
 *
 * 核心职责：
 * - YAML 数据到数据库字段的提取与转换
 * - 关联子表数据的批量更新（先清空后插入策略）
 * - 用户上下文信息（查询词、语境句）的提取
 * - 配置驱动的子表映射，避免硬编码逻辑
 *
 * 在整个系统中的定位：
 * - 上层：被 WordService 调用，接收 YAML 格式的词汇数据
 * - 下层：调用 WordRepository 或直接执行 SQL 操作子表
 * - 设计模式：采用 Data Mapper 模式，隔离数据格式与存储细节
 *
 * 【实现思路】
 * 1. 配置驱动的子表映射设计：
 *    - 使用 _subTableConfigs 数组定义所有子表的映射规则
 *    - 每个配置包含：目标表名、字段映射、数据提取函数、是否数组类型
 *    - 新增子表时只需添加配置，无需修改核心逻辑
 *
 * 2. 子表更新策略（Clear-And-Insert）：
 *    - 先清空（DELETE）词汇的所有子表关联数据
 *    - 再插入（INSERT）新的子表数据
 *    - 优点：逻辑简单、无需处理复杂的 diff 逻辑
 *    - 缺点：会丢失子表记录的创建时间等历史信息
 *
 * 3. 数据提取与转换：
 *    - extractWordData: 从 YAML 提取主表字段，处理嵌套对象访问
 *    - extractUserContext: 提取用户查询上下文用于日志记录
 *    - getData 函数：根据配置从 YAML 中提取并转换子表数据
 *
 * 4. 批量操作优化：
 *    - _clearChildren: 使用 Promise.all 并行清空多个子表
 *    - _insertChildren: 收集所有插入操作后统一执行
 *    - 减少数据库往返次数，提升性能
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - Clear-And-Insert 策略会导致子表历史数据丢失
 *    - 若子表有独立的业务含义（如用户收藏的例句），此策略不适用
 *    - 当前设计假设子表数据完全派生自主表 YAML 数据
 *
 * 2. 性能瓶颈：
 *    - 每次更新都要删除并重新插入所有子表数据
 *    - 对于子表数据较多的词汇，更新操作可能较慢
 *    - 建议：考虑使用 UPSERT 策略优化更新性能
 *
 * 3. 边界条件处理：
 *    - getData 返回 null 时表示该子表无数据，跳过插入
 *    - 数组类型子表为空数组时，不插入任何记录
 *    - 使用 ?? null 处理 undefined 值，确保 SQL 参数正确
 *
 * 4. 数据一致性：
 *    - 所有子表操作必须在同一事务中执行
 *    - 调用方（WordService）负责事务管理
 *    - 若清空成功但插入失败，事务回滚保证数据一致性
 *
 * 5. 依赖关系：
 *    - 强依赖：数据库连接 client（通过参数传入）
 *    - 数据结构依赖：YAML 结构需与配置中的 source 路径匹配
 *    - 表结构依赖：etymologies, cognates, examples, synonyms
 *
 * 6. 配置扩展指南：
 *    新增子表时，在 _subTableConfigs 中添加配置对象：
 *    {
 *      table: '表名',
 *      fields: [
 *        { db: '数据库字段名', source: 'YAML中的字段路径' }
 *      ],
 *      isArray: true/false,  // 是否为一对多关系
 *      getData: (data) => {  // 从 YAML 提取数据的函数
 *        // 返回对象（isArray=false）或对象数组（isArray=true）
 *      }
 *    }
 *
 * 7. 未来优化方向：
 *    - 实现增量更新策略，只修改变化的子表记录
 *    - 添加数据变更日志，记录子表的修改历史
 *    - 支持子表记录的软删除，保留历史数据
 *    - 考虑使用 ORM 的关联机制简化代码
 * ============================================================================
 */

class WordAssembler {
  constructor() {
    /**
     * 子表配置数组
     * 每个配置定义了一个子表的映射规则
     */
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
        getData: data => {
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
        getData: data => {
          const cognates = data.cognate_family?.cognates || [];
          return cognates
            .filter(c => c.word)
            .map(c => ({
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
        getData: data => {
          const examples = data.application?.selected_examples || [];
          return examples
            .filter(e => e.sentence)
            .map(e => ({
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
        getData: data => {
          const synonyms = data.nuance?.synonyms || [];
          return synonyms
            .filter(s => s.word)
            .map(s => ({
              word: s.word,
              meaning_zh: s.meaning_zh,
            }));
        },
      },
    ];
  }

  /**
   * 更新词汇的所有子表数据
   * 采用先清空后插入的策略
   * @param {Object} client - 数据库连接客户端（事务上下文）
   * @param {string|number} wordId - 词汇 ID
   * @param {Object} data - YAML 数据对象
   */
  async updateChildren(client, wordId, data) {
    await this._clearChildren(client, wordId);
    await this._insertChildren(client, wordId, data);
  }

  /**
   * 清空词汇的所有子表数据
   * @param {Object} client - 数据库连接客户端
   * @param {string|number} wordId - 词汇 ID
   *
   * 注意：此操作会删除该词汇在所有子表中的关联记录
   */
  async _clearChildren(client, wordId) {
    const tables = ['etymologies', 'cognates', 'examples', 'synonyms'];
    const deletePromises = tables.map(table =>
      client.query(`DELETE FROM ${table} WHERE word_id = $1`, [wordId])
    );
    await Promise.all(deletePromises);
  }

  /**
   * 插入词汇的所有子表数据
   * @param {Object} client - 数据库连接客户端
   * @param {string|number} wordId - 词汇 ID
   * @param {Object} data - YAML 数据对象
   *
   * 处理逻辑：
   * 1. 遍历所有子表配置
   * 2. 调用 getData 提取数据
   * 3. 根据 isArray 决定单条插入还是批量插入
   * 4. 使用 Promise.all 并行执行所有插入
   */
  async _insertChildren(client, wordId, data) {
    const insertPromises = [];

    for (const config of this._subTableConfigs) {
      const items = config.getData(data);
      if (!items) continue;

      if (config.isArray) {
        for (const item of items) {
          insertPromises.push(this._insertSingle(client, wordId, config, item));
        }
      } else {
        insertPromises.push(this._insertSingle(client, wordId, config, items));
      }
    }

    await Promise.all(insertPromises);
  }

  /**
   * 插入单条子表记录
   * @param {Object} client - 数据库连接客户端
   * @param {string|number} wordId - 词汇 ID
   * @param {Object} config - 子表配置对象
   * @param {Object} item - 要插入的数据对象
   *
   * SQL 构建说明：
   * - 使用参数化查询防止 SQL 注入
   * - $1 固定为 word_id，后续参数为字段值
   * - 使用 ?? null 处理可能的 undefined 值
   */
  async _insertSingle(client, wordId, config, item) {
    const dbFields = config.fields.map(f => f.db);
    const placeholders = dbFields.map((_, i) => `$${i + 2}`).join(', ');
    const values = config.fields.map(f => item[f.source] ?? null);

    const sql = `
      INSERT INTO ${config.table} (word_id, ${dbFields.join(', ')})
      VALUES ($1, ${placeholders})
    `;

    await client.query(sql, [wordId, ...values]);
  }

  /**
   * 从 YAML 数据中提取主表字段
   * @param {Object} data - YAML 数据对象
   * @returns {Object} 提取的主表字段对象
   *
   * 字段映射：
   * - yield.lemma -> lemma
   * - yield.syllabification -> syllabification
   * - yield.part_of_speech -> partOfSpeech
   * - yield.contextual_meaning.en/zh -> contextualMeaningEn/Zh
   * - yield.other_common_meanings -> otherCommonMeanings（数组，默认空数组）
   * - nuance.image_differentiation_zh -> imageDifferentiationZh
   * - 整个 data 对象 -> originalYaml（JSONB 格式存储）
   */
  extractWordData(data) {
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

  /**
   * 从 YAML 数据中提取用户上下文信息
   * @param {Object} data - YAML 数据对象
   * @returns {Object} 用户上下文对象
   *
   * 用途：
   * - userWord: 用户实际输入的词汇（可能包含变形）
   * - userContext: 用户提供的语境句子
   * 这些信息用于 user_requests 表的日志记录
   */
  extractUserContext(data) {
    const yieldData = data.yield || {};
    return {
      userWord: yieldData.user_word,
      userContext: yieldData.user_context_sentence,
    };
  }
}

module.exports = new WordAssembler();
