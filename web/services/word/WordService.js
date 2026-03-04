/**
 * ============================================================================
 * WordService - 词汇业务服务层
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是词汇管理系统的核心业务逻辑编排层，负责协调词汇的增删改查、
 * 冲突检测、词形还原等完整业务流程。作为系统的"指挥官"，它将业务需求
 * 转化为具体的技术实现，协调验证器(Validator)、仓储层(Repository)、
 * 组装器(Assembler)等多个子模块完成复杂的业务操作。
 *
 * 在整个系统中的定位：
 * - 上层：接收来自 Controller 的业务请求
 * - 下层：调用 Repository 进行数据持久化，使用 Validator 进行数据校验
 * - 同级：与 ConflictService 协作处理数据冲突
 *
 * 【实现思路】
 * 1. 分层架构设计：
 *    - 严格遵循"单一职责原则"，将 SQL 操作、数据验证、实体组装分离到
 *      各自独立的模块中，本层仅负责业务流程编排
 *    - 使用"事务脚本模式"处理复杂的业务事务，确保数据一致性
 *
 * 2. 事务管理机制：
 *    - 所有写操作(addWord/saveWord)均采用显式数据库事务
 *    - 使用 try-catch-finally 模式确保事务正确提交或回滚
 *    - 通过 client.release() 保证连接池资源释放，防止连接泄漏
 *
 * 3. 冲突检测策略：
 *    - 基于 YAML 内容深度对比检测数据冲突
 *    - 支持强制更新(forceUpdate)模式，允许管理员覆盖现有数据
 *    - 冲突分析结果包含详细的差异对比(diff)信息
 *
 * 4. 词形还原算法：
 *    - 使用 compromise 库进行自然语言处理
 *    - 动词转换为不定式，名词转换为单数形式
 *    - 实现词汇的标准化存储和检索
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - 并发场景下可能出现重复插入(唯一约束冲突)，代码中已捕获错误码 23505
 *    - 事务中若发生未捕获异常，需确保连接正确释放
 *    - YAML 解析异常需友好处理，避免暴露内部错误细节
 *
 * 2. 性能瓶颈：
 *    - listWordsPaged 中的分页查询在大数据量时可能性能下降
 *    - checkWord 中的 NLP 处理在高并发时可能成为瓶颈
 *    - 建议：考虑为 lemma 字段添加索引，优化查询性能
 *
 * 3. 边界条件处理：
 *    - 空字符串/undefined 参数的统一处理
 *    - 分页参数的合法性校验(page/limit 范围限制)
 *    - 重复数据的检测与处理逻辑
 *
 * 4. 依赖关系：
 *    - 强依赖：WordRepository(数据访问)、WordValidator(数据验证)
 *             WordAssembler(实体组装)、conflictService(冲突检测)
 *    - 外部依赖：compromise(NLP处理)、js-yaml(YAML解析)
 *
 * 5. 未来优化方向：
 *    - 引入缓存机制(Redis)减少数据库查询压力
 *    - 实现批量操作接口提升大批量数据处理性能
 *    - 考虑使用乐观锁机制处理并发更新场景
 *    - 添加操作日志审计功能，记录关键业务操作
 * ============================================================================
 */

const yaml = require('js-yaml');
const nlp = require('compromise');
const { getPool } = require('../../db');
const conflictService = require('../conflictService');
const validator = require('./WordValidator');
const repository = require('./WordRepository');
const assembler = require('./WordAssembler');

class WordService {
  /**
   * 添加新词汇
   * @param {Object} req - HTTP 请求对象，用于获取数据库连接
   * @param {string} wordText - 用户输入的词汇文本
   * @param {string} yamlStr - 词汇详细信息的 YAML 格式字符串
   * @returns {Object} 操作结果，包含状态(created/duplicate/invalid)和相关信息
   *
   * 业务流程：
   * 1. 参数预处理(去除空白、转小写)
   * 2. YAML 解析验证
   * 3. 业务规则验证
   * 4. 开启数据库事务
   * 5. 检查词汇是否已存在
   * 6. 提取并组装词汇数据
   * 7. 插入主表记录
   * 8. 插入子表关联数据
   * 9. 提交事务
   */
  async addWord(req, wordText, yamlStr) {
    const wordLower = String(wordText || '')
      .trim()
      .toLowerCase();
    if (!wordLower) return { status: 'invalid', errors: ['word is required'] };

    let data;
    try {
      data = yaml.load(String(yamlStr || ''));
    } catch {
      return { status: 'invalid', errors: ['yaml parse error'] };
    }

    const validation = validator.validate(data, wordLower);
    if (!validation.valid) {
      return { status: 'invalid', errors: validation.errors };
    }

    const pool = await getPool(req);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await repository.findByLemma(req, wordLower, client);
      if (existing) {
        await client.query('ROLLBACK');
        return { status: 'duplicate', lemma: existing.lemma, id: existing.id };
      }

      const wordData = assembler.extractWordData(data);
      const insertResult = await repository.create(req, wordData, client);
      const wordId = insertResult.id;

      await assembler.updateChildren(client, wordId, data);
      await client.query('COMMIT');

      return { status: 'created', id: wordId, lemma: insertResult.lemma };
    } catch (e) {
      await client.query('ROLLBACK');
      if (e && e.code === '23505') {
        return { status: 'duplicate', lemma: wordLower };
      }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * 获取词汇列表
   * 根据请求参数自动判断是否需要分页查询
   * @param {Object} req - HTTP 请求对象
   * @returns {Array|Object} 词汇列表或分页结果
   */
  async listWords(req) {
    if (req.query && (req.query.page || req.query.limit || req.query.search || req.query.sort)) {
      return this.listWordsPaged(req);
    }
    return repository.listAll(req);
  }

  /**
   * 分页查询词汇列表
   * @param {Object} req - HTTP 请求对象，包含分页参数
   * @returns {Object} 分页结果，包含 items(数据列表)、page(当前页)、
   *                   limit(每页数量)、total(总数)、totalPages(总页数)
   */
  async listWordsPaged(req) {
    const options = {
      page: parseInt(req.query.page || '1', 10) || 1,
      limit: parseInt(req.query.limit || '20', 10) || 20,
      search: (req.query.search || '').trim(),
      sort: (req.query.sort || 'newest').trim(),
    };
    return repository.listPaged(req, options);
  }

  /**
   * 根据 ID 获取词汇详情
   * @param {Object} req - HTTP 请求对象
   * @param {string|number} id - 词汇 ID
   * @returns {Object} 词汇详情对象
   * @throws {Error} 当 ID 为空或词汇不存在时抛出异常
   */
  async getWordById(req, id) {
    if (!id) throw new Error('Missing id');
    const word = await repository.findById(req, id);
    if (!word) throw new Error('Not found');
    return word;
  }

  /**
   * 获取词汇完整详情（包含关联数据）
   * @param {Object} req - HTTP 请求对象
   * @param {string} wordText - 词汇文本
   * @param {Array} include - 需要包含的关联数据类型
   * @returns {Object} 词汇完整详情
   * @throws {Error} 当词汇不存在时抛出异常
   */
  async getWordDetails(req, wordText, include = []) {
    const details = await repository.getDetails(req, wordText, include);
    if (!details) throw new Error('Not found');
    return details;
  }

  /**
   * 检查词汇是否存在并进行词形还原
   * 使用 NLP 技术将词汇转换为标准形式（动词→不定式，名词→单数）
   * @param {Object} req - HTTP 请求对象
   * @param {string} userWord - 用户输入的词汇
   * @returns {Object} 查询结果，包含 found(是否找到)、lemma(标准形式)、data(词汇数据)
   */
  async checkWord(req, userWord) {
    const doc = nlp(userWord);
    doc.verbs().toInfinitive();
    doc.nouns().toSingular();
    const lemma = doc.text().trim().toLowerCase() || userWord.toLowerCase();

    const existing = await repository.findByLemma(req, lemma);

    if (existing) {
      return { found: true, lemma, data: existing };
    }
    return { found: false, lemma };
  }

  /**
   * 检查 YAML 内容是否与现有数据冲突
   * 用于导入/同步场景下的数据冲突预检
   * @param {Object} req - HTTP 请求对象
   * @param {string} yamlStr - YAML 格式字符串
   * @returns {Object} 冲突检测结果，status 可能为：created(新建)/conflict(冲突)/ok(无冲突)
   */
  async checkConflict(req, yamlStr) {
    if (!yamlStr) throw new Error('No content');
    const data = yaml.load(yamlStr);
    const lemma = data.yield?.lemma?.toLowerCase();
    if (!lemma) throw new Error('Missing lemma');

    const existing = await repository.findByLemma(req, lemma);

    if (!existing) return { status: 'created', lemma };

    const analysis = conflictService.analyze(existing.original_yaml, data);

    if (analysis.hasConflict) {
      return {
        status: 'conflict',
        lemma,
        diff: analysis.diff,
        oldData: existing.original_yaml,
        newData: data,
      };
    }

    return { status: 'ok', lemma };
  }

  /**
   * 保存词汇（创建或更新）
   * 支持智能冲突检测和强制更新模式
   * @param {Object} req - HTTP 请求对象
   * @param {string} yamlStr - YAML 格式字符串
   * @param {boolean} forceUpdate - 是否强制更新（忽略冲突）
   * @returns {Object} 操作结果，status 可能为：created(新建)/updated(更新)/logged(仅记录)/conflict(冲突)
   *
   * 业务流程：
   * 1. 解析 YAML 并提取 lemma
   * 2. 开启数据库事务
   * 3. 查询现有词汇
   * 4. 分析数据冲突
   * 5. 根据冲突情况决定操作类型
   * 6. 执行创建或更新操作
   * 7. 记录用户请求日志
   * 8. 提交事务
   */
  async saveWord(req, yamlStr, forceUpdate) {
    if (!yamlStr) throw new Error('No YAML content');
    const data = yaml.load(yamlStr);
    const lemma = data.yield?.lemma?.toLowerCase();
    if (!lemma) throw new Error('YAML missing yield.lemma');

    const pool = await getPool(req);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await repository.findByLemma(req, lemma, client);
      const analysis = existing ? conflictService.analyze(existing.original_yaml, data) : null;

      if (existing && !forceUpdate && analysis?.hasConflict) {
        await client.query('ROLLBACK');
        return {
          status: 'conflict',
          diff: analysis.diff,
          oldData: existing.original_yaml,
          newData: data,
        };
      }

      let wordId;
      let status;

      if (existing) {
        wordId = existing.id;
        const shouldUpdate = !!forceUpdate || !!analysis?.hasConflict;

        if (shouldUpdate) {
          const wordData = assembler.extractWordData(data);
          await repository.update(req, wordId, wordData, client);
          await assembler.updateChildren(client, wordId, data);
          status = 'updated';
        } else {
          status = 'logged';
        }
      } else {
        const wordData = assembler.extractWordData(data);
        const insertResult = await repository.create(req, wordData, client);
        wordId = insertResult.id;
        await assembler.updateChildren(client, wordId, data);
        status = 'created';
      }

      const userContext = assembler.extractUserContext(data);
      await repository.logUserRequest(
        client,
        wordId,
        userContext.userWord,
        userContext.userContext
      );

      await client.query('COMMIT');

      return { success: true, id: wordId, lemma, status };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * 删除词汇
   * @param {Object} req - HTTP 请求对象
   * @param {string|number} id - 词汇 ID
   * @returns {Object} 操作结果
   */
  async deleteWord(req, id) {
    await repository.delete(req, id);
    return { success: true };
  }
}

module.exports = new WordService();
