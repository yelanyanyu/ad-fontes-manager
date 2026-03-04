/**
 * ============================================================================
 * WordRepository - 词汇数据访问层（Repository Pattern）
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是词汇管理系统的数据访问层，负责所有与词汇相关的数据库操作。
 * 作为系统中唯一允许直接操作数据库连接池的模块，它封装了所有 SQL 查询，
 * 为上层业务逻辑提供统一、简洁的数据访问接口。
 *
 * 核心职责：
 * - 词汇主表(words)的 CRUD 操作
 * - 关联子表(etymologies/cognates/examples/synonyms)的查询
 * - 分页查询与搜索功能的实现
 * - 用户请求日志的记录
 *
 * 在整个系统中的定位：
 * - 上层：被 WordService 调用，接收业务层面的数据操作请求
 * - 下层：直接操作 PostgreSQL 数据库，通过 getPool 获取连接
 * - 设计模式：采用 Repository 模式，隔离业务逻辑与数据访问细节
 *
 * 【实现思路】
 * 1. 数据库连接管理：
 *    - 支持两种连接模式：使用传入的 client（事务场景）或新建连接（简单查询）
 *    - 通过 client 参数实现事务支持，确保原子性操作
 *    - 非事务方法自动管理连接生命周期
 *
 * 2. SQL 查询设计原则：
 *    - 使用参数化查询($1, $2...)防止 SQL 注入攻击
 *    - 明确指定查询字段，避免 SELECT * 带来的性能与安全问题
 *    - 利用 PostgreSQL 的 lower() 函数实现大小写不敏感的匹配
 *
 * 3. 分页查询实现：
 *    - 采用经典的"双查询"模式：先查总数，再查数据
 *    - 参数校验：page >= 1, limit 范围 [1, 200]
 *    - 支持多字段排序（创建时间、字母顺序等）
 *    - 动态 WHERE 子句构建，支持搜索关键词过滤
 *
 * 4. 关联数据查询优化：
 *    - getDetails 方法使用并行查询(Promise.all)加载关联数据
 *    - 按需加载策略：通过 include 参数控制需要查询的关联表
 *    - 减少 N+1 查询问题，提升查询性能
 *
 * 【特别注意】
 * 1. 安全风险：
 *    - 所有用户输入必须通过参数化查询传递，禁止字符串拼接 SQL
 *    - 当前实现已正确使用参数化查询，但需注意后续维护时保持一致
 *    - getDetails 中的 orderBy 直接拼接，但使用的是内部枚举值，风险可控
 *
 * 2. 性能瓶颈：
 *    - listPaged 中的 LIKE 查询在数据量大时性能较差
 *    - 建议：为 lemma 字段创建索引 CREATE INDEX idx_words_lemma ON words(lower(lemma))
 *    - getDetails 的并行查询在关联数据多时可能占用较多连接
 *
 * 3. 边界条件处理：
 *    - 分页参数校验：防止负数页码或过大的 limit 值
 *    - 空结果处理：统一返回 null（单条查询）或空数组（列表查询）
 *    - 大小写处理：所有字符串比较均使用 lower() 函数转小写
 *
 * 4. 事务处理约定：
 *    - 创建、更新、删除操作需要传入 client 参数以参与事务
 *    - 查询操作通常不需要事务，但支持传入 client 以保持一致性读取
 *    - 事务控制（BEGIN/COMMIT/ROLLBACK）由调用方（WordService）管理
 *
 * 5. 依赖关系：
 *    - 强依赖：db 模块的 getPool 函数获取数据库连接池
 *    - 数据库表结构：words, etymologies, cognates, examples, synonyms, user_requests
 *
 * 6. 未来优化方向：
 *    - 引入连接池监控，检测连接泄漏问题
 *    - 实现查询缓存机制，缓存热点数据
 *    - 添加慢查询日志，识别性能瓶颈
 *    - 考虑使用 ORM 或查询构建器提升开发效率
 * ============================================================================
 */

const { getPool } = require('../../db');

class WordRepository {
  /**
   * 根据词汇原型(lemma)查找词汇
   * @param {Object} req - HTTP 请求对象
   * @param {string} lemma - 词汇原型（已转小写）
   * @param {Object} client - 可选的数据库连接客户端（用于事务）
   * @returns {Object|null} 词汇记录对象，未找到时返回 null
   *
   * 注意：使用 lower() 函数实现大小写不敏感查询
   */
  async findByLemma(req, lemma, client = null) {
    const dbClient = client || (await getPool(req));
    const result = await dbClient.query('SELECT * FROM words WHERE lower(lemma) = $1', [
      lemma.toLowerCase(),
    ]);
    return result.rows[0] || null;
  }

  /**
   * 根据 ID 查找词汇
   * @param {Object} req - HTTP 请求对象
   * @param {string|number} id - 词汇 ID
   * @param {Object} client - 可选的数据库连接客户端
   * @returns {Object|null} 词汇记录对象
   *
   * 查询字段说明：
   * - 包含词汇基本信息、统计字段(revision_count)、原始 YAML 数据
   * - 不包含关联表数据（etymologies/cognates 等）
   */
  async findById(req, id, client = null) {
    const dbClient = client || (await getPool(req));
    const result = await dbClient.query(
      'SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, contextual_meaning_zh, other_common_meanings, image_differentiation_zh, created_at, updated_at, revision_count, original_yaml FROM words WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * 创建新词汇记录
   * @param {Object} req - HTTP 请求对象
   * @param {Object} wordData - 词汇数据对象
   * @param {Object} client - 数据库连接客户端（必须，用于事务）
   * @returns {Object} 插入结果，包含 id 和 lemma
   *
   * 插入字段映射：
   * - lemma: 词汇原型
   * - syllabification: 音节划分
   * - part_of_speech: 词性
   * - contextual_meaning_en/zh: 语境释义（英文/中文）
   * - other_common_meanings: 其他常见含义（数组）
   * - image_differentiation_zh: 图像辨析（中文）
   * - original_yaml: 原始 YAML 数据（JSONB 格式）
   */
  async create(req, wordData, client) {
    const {
      lemma,
      syllabification,
      partOfSpeech,
      contextualMeaningEn,
      contextualMeaningZh,
      otherCommonMeanings,
      imageDifferentiationZh,
      originalYaml,
    } = wordData;

    const result = await client.query(
      `
        INSERT INTO words (
          lemma, syllabification, part_of_speech,
          contextual_meaning_en, contextual_meaning_zh,
          other_common_meanings, image_differentiation_zh, original_yaml
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, lemma
      `,
      [
        lemma,
        syllabification,
        partOfSpeech,
        contextualMeaningEn,
        contextualMeaningZh,
        otherCommonMeanings || [],
        imageDifferentiationZh,
        originalYaml,
      ]
    );

    return result.rows[0];
  }

  /**
   * 更新词汇记录
   * @param {Object} req - HTTP 请求对象
   * @param {string|number} wordId - 词汇 ID
   * @param {Object} wordData - 更新的词汇数据
   * @param {Object} client - 数据库连接客户端（必须，用于事务）
   *
   * 更新策略：
   * - 使用 revision_count = revision_count + 1 实现版本计数
   * - 自动更新 updated_at 字段为当前时间
   * - 不更新 lemma 字段（业务上不允许修改词汇原型）
   */
  async update(req, wordId, wordData, client) {
    const {
      partOfSpeech,
      syllabification,
      contextualMeaningEn,
      contextualMeaningZh,
      otherCommonMeanings,
      imageDifferentiationZh,
      originalYaml,
    } = wordData;

    await client.query(
      `
        UPDATE words SET 
          part_of_speech = $1, syllabification = $2, contextual_meaning_en = $3, 
          contextual_meaning_zh = $4, other_common_meanings = $5, image_differentiation_zh = $6,
          original_yaml = $7, revision_count = revision_count + 1, updated_at = now()
        WHERE id = $8
      `,
      [
        partOfSpeech,
        syllabification,
        contextualMeaningEn,
        contextualMeaningZh,
        otherCommonMeanings || [],
        imageDifferentiationZh,
        originalYaml,
        wordId,
      ]
    );
  }

  /**
   * 删除词汇记录
   * @param {Object} req - HTTP 请求对象
   * @param {string|number} id - 词汇 ID
   * @param {Object} client - 可选的数据库连接客户端
   *
   * 注意：
   * - 数据库已配置外键级联删除，删除词汇会自动清理关联表数据
   * - 删除操作不可逆，调用前需确认业务逻辑
   */
  async delete(req, id, client = null) {
    const dbClient = client || (await getPool(req));
    await dbClient.query('DELETE FROM words WHERE id = $1', [id]);
  }

  /**
   * 获取所有词汇列表（不分页）
   * @param {Object} req - HTTP 请求对象
   * @returns {Array} 词汇记录数组，按创建时间倒序排列
   *
   * 适用场景：数据量较小(几百条以内)的管理后台列表页
   * 注意：数据量大时请使用 listPaged 分页查询
   */
  async listAll(req) {
    const pool = await getPool(req);
    const result = await pool.query(`
      SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at, revision_count, original_yaml
      FROM words 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * 分页查询词汇列表
   * @param {Object} req - HTTP 请求对象
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（从1开始）
   * @param {number} options.limit - 每页数量（最大200）
   * @param {string} options.search - 搜索关键词（匹配 lemma）
   * @param {string} options.sort - 排序方式（newest/oldest/az/za）
   * @returns {Object} 分页结果对象
   *
   * 返回结构：
   * {
   *   items: [...],      // 当前页数据
   *   page: 1,           // 当前页码
   *   limit: 20,         // 每页数量
   *   total: 100,        // 总记录数
   *   totalPages: 5      // 总页数
   * }
   */
  async listPaged(req, options) {
    const pool = await getPool(req);
    const { page = 1, limit = 20, search = '', sort = 'newest' } = options;

    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(200, Math.max(1, limit));
    const offset = (validatedPage - 1) * validatedLimit;

    const where = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`lower(lemma) LIKE $${params.length}`);
    }

    let orderBy = 'created_at DESC';
    if (sort === 'az') orderBy = 'lemma ASC';
    if (sort === 'za') orderBy = 'lemma DESC';
    if (sort === 'newest') orderBy = 'created_at DESC';
    if (sort === 'oldest') orderBy = 'created_at ASC';

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM words ${whereSql}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / validatedLimit) || 1);

    const dataParams = [...params, validatedLimit, offset];
    const dataRes = await pool.query(
      `
        SELECT id, lemma, part_of_speech, syllabification, contextual_meaning_en, created_at, updated_at, revision_count
        FROM words
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      dataParams
    );

    return {
      items: dataRes.rows,
      page: validatedPage,
      limit: validatedLimit,
      total,
      totalPages,
    };
  }

  /**
   * 获取词汇完整详情（包含关联数据）
   * @param {Object} req - HTTP 请求对象
   * @param {string} wordText - 词汇文本
   * @param {Array} include - 需要包含的关联数据类型
   * @returns {Object|null} 词汇完整详情，未找到时返回 null
   *
   * 支持的关联数据类型：
   * - 'rawyaml': 原始 YAML 数据
   * - 'etymology': 词源信息（prefix, root, suffix, history_myth 等）
   * - 'cognates': 同源词列表
   * - 'examples': 例句列表
   * - 'synonyms': 近义词列表
   *
   * 实现特点：
   * - 使用 Promise.all 并行查询多个关联表
   * - 按需加载，只查询指定的关联数据
   */
  async getDetails(req, wordText, include = []) {
    const pool = await getPool(req);
    const inc = new Set(include.map(s => String(s || '').toLowerCase()));

    const selectFields = [
      'id',
      'lemma',
      'syllabification',
      'other_common_meanings',
      'image_differentiation_zh',
    ];
    if (inc.has('rawyaml')) {
      selectFields.push('original_yaml');
    }

    const wordRes = await pool.query(
      `SELECT ${selectFields.join(', ')} FROM words WHERE lower(lemma) = $1`,
      [String(wordText).toLowerCase()]
    );

    if (wordRes.rows.length === 0) {
      return null;
    }

    const base = wordRes.rows[0];
    const queries = [];
    const keys = [];

    if (inc.has('etymology')) {
      queries.push(
        pool.query(
          `SELECT prefix, root, suffix, structure_analysis, history_myth, source_word, pie_root, visual_imagery_zh, meaning_evolution_zh FROM etymologies WHERE word_id = $1`,
          [base.id]
        )
      );
      keys.push('etymology');
    }
    if (inc.has('cognates')) {
      queries.push(
        pool.query(`SELECT cognate_word, logic FROM cognates WHERE word_id = $1`, [base.id])
      );
      keys.push('cognates');
    }
    if (inc.has('examples')) {
      queries.push(
        pool.query(
          `SELECT example_type, sentence, translation_zh FROM examples WHERE word_id = $1`,
          [base.id]
        )
      );
      keys.push('examples');
    }
    if (inc.has('synonyms')) {
      queries.push(
        pool.query(`SELECT synonym_word, meaning_zh FROM synonyms WHERE word_id = $1`, [base.id])
      );
      keys.push('synonyms');
    }

    if (queries.length) {
      const results = await Promise.all(queries);
      results.forEach((r, i) => {
        const k = keys[i];
        base[k] = k === 'etymology' ? r.rows[0] || null : r.rows;
      });
    }

    return {
      lemma: base.lemma,
      syllabification: base.syllabification,
      other_common_meanings: base.other_common_meanings,
      image_differentiation_zh: base.image_differentiation_zh,
      ...(inc.has('rawyaml') ? { original_yaml: base.original_yaml } : {}),
      ...(inc.has('etymology') ? { etymology: base.etymology ?? null } : {}),
      ...(inc.has('cognates') ? { cognates: base.cognates ?? [] } : {}),
      ...(inc.has('examples') ? { examples: base.examples ?? [] } : {}),
      ...(inc.has('synonyms') ? { synonyms: base.synonyms ?? [] } : {}),
    };
  }

  /**
   * 记录用户查询请求
   * @param {Object} client - 数据库连接客户端
   * @param {string|number} wordId - 词汇 ID
   * @param {string} userWord - 用户输入的词汇
   * @param {string} userContext - 用户提供的语境句子
   *
   * 用途：
   * - 用于分析用户查询行为
   * - 收集用户实际使用的语境，用于后续词汇优化
   * - 支持词汇热度统计
   */
  async logUserRequest(client, wordId, userWord, userContext) {
    if (!userWord && !userContext) return;

    await client.query(
      `
        INSERT INTO user_requests (word_id, user_input, context_sentence)
        VALUES ($1, $2, $3)
      `,
      [wordId, userWord, userContext]
    );
  }
}

module.exports = new WordRepository();
