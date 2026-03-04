/**
 * ============================================================================
 * WordValidator - 词汇数据验证器（Declarative Schema Validation）
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是词汇管理系统的数据验证层，负责 YAML 格式词汇数据的结构校验与
 * 业务规则验证。采用声明式 Schema 配置的方式定义验证规则，将验证逻辑与
 * 业务规则分离，确保入库数据的完整性和一致性。
 *
 * 核心职责：
 * - YAML 数据结构验证（必填字段、字段类型、嵌套结构）
 * - 业务规则验证（lemma 与查询词匹配、数组非空等）
 * - 提供清晰的错误信息，指导用户修正数据
 * - 支持灵活的 Schema 扩展，适应业务变化
 *
 * 在整个系统中的定位：
 * - 上层：被 WordService 调用，在数据持久化前执行验证
 * - 下层：无外部依赖，纯逻辑处理模块
 * - 设计模式：采用策略模式（Strategy Pattern）组织验证器函数
 *
 * 【实现思路】
 * 1. 声明式 Schema 设计：
 *    - 使用嵌套对象结构定义 YAML 的层次关系
 *    - 每个字段配置包含：required（是否必填）、validate（验证函数）、
 *      message（错误信息）、fields（嵌套字段）
 *    - 验证规则与代码分离，便于维护和扩展
 *
 * 2. 验证器函数库：
 *    - isNonEmptyString: 非空字符串验证
 *    - isObject: 对象类型验证
 *    - isNonEmptyArray: 非空数组验证
 *    - 支持自定义验证函数，接收 value 和 context 参数
 *
 * 3. 递归验证算法：
 *    - _validateSection 方法递归遍历 Schema 树
 *    - 深度优先遍历所有字段，收集所有验证错误
 *    - 支持上下文传递（如 wordLower 用于 lemma 匹配验证）
 *
 * 4. 错误处理策略：
 *    - 收集所有错误后统一返回，不遇到第一个错误就停止
 *    - 错误信息包含完整字段路径（如 yield.contextual_meaning.en）
 *    - 便于用户一次性发现并修正所有问题
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - 验证规则与 YAML 结构强耦合，YAML 结构变更时需同步更新 Schema
 *    - 当前实现为"严格验证模式"，所有字段均为必填
 *    - 若业务需要支持部分字段可选，需调整 required 配置
 *
 * 2. 性能考虑：
 *    - 递归验证在大对象上可能产生较多函数调用
 *    - 对于高频调用的接口，可考虑缓存验证结果
 *    - 当前实现对于一般规模的 YAML 数据性能良好
 *
 * 3. 边界条件处理：
 *    - 根对象验证：确保传入的是对象而非数组或基本类型
 *    - undefined 处理：区分"字段不存在"和"字段值为空"
 *    - 数组项验证：对数组内每个对象进行结构验证
 *    - 大小写敏感：lemma 验证时统一转小写比较
 *
 * 4. 扩展性设计：
 *    - 新增验证器：在 _validators 对象中添加函数
 *    - 新增字段：在 _buildWordSchema 中添加配置
 *    - 支持条件验证：验证函数接收 context 参数，可实现复杂业务规则
 *
 * 5. 依赖关系：
 *    - 无外部依赖，纯 JavaScript 实现
 *    - 输入数据格式：YAML 解析后的 JavaScript 对象
 *
 * 6. 验证规则清单：
 *    根级别：
 *    - yield（必填对象）
 *      - user_word（必填非空字符串）
 *      - lemma（必填，必须匹配查询词）
 *      - syllabification（必填非空字符串）
 *      - user_context_sentence（必填非空字符串）
 *      - part_of_speech（必填非空字符串）
 *      - contextual_meaning（必填对象）
 *        - en/zh（必填非空字符串）
 *      - other_common_meanings（必填非空数组）
 *    - etymology（必填对象）
 *      - root_and_affixes（必填对象）
 *        - prefix/root/suffix/structure_analysis（必填非空字符串）
 *      - historical_origins（必填对象）
 *        - history_myth/source_word/pie_root（必填非空字符串）
 *      - visual_imagery_zh/meaning_evolution_zh（必填非空字符串）
 *    - cognate_family（必填对象）
 *      - cognates（必填非空数组，每项含 word 和 logic）
 *    - application（必填对象）
 *      - selected_examples（必填非空数组，每项含 type/sentence/translation_zh）
 *    - nuance（必填对象）
 *      - image_differentiation_zh（必填非空字符串）
 *      - synonyms（必填非空数组，每项含 word 和 meaning_zh）
 *
 * 7. 未来优化方向：
 *    - 引入 JSON Schema 标准，提升可移植性
 *    - 支持异步验证（如检查 lemma 是否已存在）
 *    - 添加验证规则的可配置化（如通过配置文件定义）
 *    - 实现验证结果的国际化（多语言错误信息）
 * ============================================================================
 */

class WordValidator {
  constructor() {
    /**
     * 验证器函数库
     * 提供常用的数据类型验证函数
     */
    this._validators = {
      isNonEmptyString: value => typeof value === 'string' && value.trim().length > 0,
      isObject: value => value && typeof value === 'object' && !Array.isArray(value),
      isNonEmptyArray: value => Array.isArray(value) && value.length > 0,
    };

    /**
     * 词汇数据 Schema
     * 定义了 YAML 数据的完整验证规则
     */
    this._wordSchema = this._buildWordSchema();
  }

  /**
   * 构建词汇验证 Schema
   * @returns {Object} 完整的验证 Schema 对象
   *
   * Schema 结构说明：
   * - root: 根对象验证
   * - yield/etymology/cognate_family/application/nuance: 各章节验证
   * - 每个字段可配置：required（必填）、validate（验证函数）、
   *   message（错误信息）、fields（嵌套字段）
   */
  _buildWordSchema() {
    const { isNonEmptyString, isObject, isNonEmptyArray } = this._validators;

    return {
      root: {
        validate: data => (isObject(data) ? null : 'root must be an object'),
      },
      yield: {
        required: true,
        validate: data => (isObject(data) ? null : 'yield is required'),
        fields: {
          user_word: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.user_word is required',
          },
          lemma: {
            required: true,
            validate: (value, context) => {
              if (!isNonEmptyString(value)) return 'yield.lemma is required';
              if (value.trim().toLowerCase() !== context.wordLower) {
                return 'yield.lemma must match word';
              }
              return null;
            },
          },
          syllabification: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.syllabification is required',
          },
          user_context_sentence: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.user_context_sentence is required',
          },
          part_of_speech: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.part_of_speech is required',
          },
          contextual_meaning: {
            required: true,
            validate: data => (isObject(data) ? null : 'yield.contextual_meaning is required'),
            fields: {
              en: {
                required: true,
                validate: isNonEmptyString,
                message: 'yield.contextual_meaning.en is required',
              },
              zh: {
                required: true,
                validate: isNonEmptyString,
                message: 'yield.contextual_meaning.zh is required',
              },
            },
          },
          other_common_meanings: {
            required: true,
            validate: data =>
              isNonEmptyArray(data)
                ? null
                : 'yield.other_common_meanings must be a non-empty array',
          },
        },
      },
      etymology: {
        required: true,
        validate: data => (isObject(data) ? null : 'etymology is required'),
        fields: {
          root_and_affixes: {
            required: true,
            validate: data => (isObject(data) ? null : 'etymology.root_and_affixes is required'),
            fields: {
              prefix: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.prefix is required',
              },
              root: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.root is required',
              },
              suffix: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.suffix is required',
              },
              structure_analysis: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.structure_analysis is required',
              },
            },
          },
          historical_origins: {
            required: true,
            validate: data => (isObject(data) ? null : 'etymology.historical_origins is required'),
            fields: {
              history_myth: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.historical_origins.history_myth is required',
              },
              source_word: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.historical_origins.source_word is required',
              },
              pie_root: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.historical_origins.pie_root is required',
              },
            },
          },
          visual_imagery_zh: {
            required: true,
            validate: isNonEmptyString,
            message: 'etymology.visual_imagery_zh is required',
          },
          meaning_evolution_zh: {
            required: true,
            validate: isNonEmptyString,
            message: 'etymology.meaning_evolution_zh is required',
          },
        },
      },
      cognate_family: {
        required: true,
        validate: data => (isObject(data) ? null : 'cognate_family is required'),
        fields: {
          cognates: {
            required: true,
            validate: data => {
              if (!isNonEmptyArray(data))
                return 'cognate_family.cognates must be a non-empty array';
              const invalid = data.some(
                c => !isObject(c) || !isNonEmptyString(c.word) || !isNonEmptyString(c.logic)
              );
              if (invalid) return 'cognate_family.cognates items must have word and logic';
              return null;
            },
          },
        },
      },
      application: {
        required: true,
        validate: data => (isObject(data) ? null : 'application is required'),
        fields: {
          selected_examples: {
            required: true,
            validate: data => {
              if (!isNonEmptyArray(data))
                return 'application.selected_examples must be a non-empty array';
              const invalid = data.some(
                e =>
                  !isObject(e) ||
                  !isNonEmptyString(e.type) ||
                  !isNonEmptyString(e.sentence) ||
                  !isNonEmptyString(e.translation_zh)
              );
              if (invalid)
                return 'application.selected_examples items must have type, sentence, translation_zh';
              return null;
            },
          },
        },
      },
      nuance: {
        required: true,
        validate: data => (isObject(data) ? null : 'nuance is required'),
        fields: {
          image_differentiation_zh: {
            required: true,
            validate: isNonEmptyString,
            message: 'nuance.image_differentiation_zh is required',
          },
          synonyms: {
            required: true,
            validate: data => {
              if (!isNonEmptyArray(data)) return 'nuance.synonyms must be a non-empty array';
              const invalid = data.some(
                s => !isObject(s) || !isNonEmptyString(s.word) || !isNonEmptyString(s.meaning_zh)
              );
              if (invalid) return 'nuance.synonyms items must have word and meaning_zh';
              return null;
            },
          },
        },
      },
    };
  }

  /**
   * 验证 YAML 数据
   * @param {Object} data - YAML 解析后的数据对象
   * @param {string} wordLower - 小写的查询词，用于验证 lemma 匹配
   * @returns {Object} 验证结果，包含 valid（是否通过）和 errors（错误列表）
   *
   * 验证流程：
   * 1. 验证根对象类型
   * 2. 递归验证所有配置字段
   * 3. 收集并返回所有错误
   */
  validate(data, wordLower) {
    const errors = [];
    const context = { wordLower };

    const rootError = this._wordSchema.root.validate(data);
    if (rootError) {
      return { valid: false, errors: [rootError] };
    }

    this._validateSection(data, this._wordSchema, '', errors, context);

    return { valid: errors.length === 0, errors };
  }

  /**
   * 递归验证数据片段
   * @param {Object} data - 当前层级的数据对象
   * @param {Object} schema - 当前层级的 Schema 配置
   * @param {string} path - 当前字段路径（用于错误信息）
   * @param {Array} errors - 错误信息收集数组
   * @param {Object} context - 验证上下文（如 wordLower）
   *
   * 递归逻辑：
   * 1. 遍历 Schema 中所有字段配置
   * 2. 检查必填字段是否存在
   * 3. 执行字段验证函数
   * 4. 递归验证嵌套字段
   */
  _validateSection(data, schema, path, errors, context) {
    for (const [key, config] of Object.entries(schema)) {
      if (key === 'root') continue;

      const currentPath = path ? `${path}.${key}` : key;
      const value = data?.[key];

      if (config.required && value === undefined) {
        errors.push(`${currentPath} is required`);
        continue;
      }

      if (value === undefined) continue;

      if (config.validate) {
        const error = config.validate(value, context);
        if (error) errors.push(error);
      }

      if (config.fields && this._validators.isObject(value)) {
        this._validateSection(value, config.fields, currentPath, errors, context);
      }
    }
  }
}

module.exports = new WordValidator();
