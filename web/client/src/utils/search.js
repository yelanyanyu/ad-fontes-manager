/**
 * ============================================================================
 * Search - 搜索工具模块
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是前端词汇管理系统的搜索工具模块，提供搜索输入处理、空白检测和
 * 记录过滤功能。用于词汇列表的搜索功能，支持部分匹配和精确匹配两种模式。
 *
 * 核心职责：
 * - 搜索输入标准化（去除多余空白、统一空格字符）
 * - 空白搜索检测
 * - 记录列表过滤（支持部分匹配和精确匹配）
 *
 * 在整个前端架构中的定位：
 * - 上层：被 WordList 组件、wordStore 调用
 * - 下层：无外部依赖，纯字符串处理
 * - 设计模式：纯函数工具模块
 *
 * 【实现思路】
 * 1. 输入标准化：
 *    - 去除首尾空白
 *    - 将多个连续空白字符（包括全角空格）替换为单个半角空格
 *    - 统一处理 undefined/null 输入
 *
 * 2. 搜索模式：
 *    - partial（部分匹配）：lemma 包含搜索词
 *    - exact（精确匹配）：lemma 完全等于搜索词
 *    - 统一转小写后进行比较，实现大小写不敏感搜索
 *
 * 3. 数据访问安全：
 *    - 支持多种 lemma 字段路径（r.lemma 或 r.yield.lemma）
 *    - 使用空字符串作为默认值
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - 大量记录过滤时可能有性能开销（时间复杂度 O(n)）
 *    - 未实现搜索防抖，高频输入可能触发过多过滤操作
 *
 * 2. 性能考虑：
 *    - 搜索词统一转小写一次，避免循环中重复转换
 *    - 使用 Array.filter 进行过滤，简洁高效
 *
 * 3. 边界条件处理：
 *    - undefined/null 输入转为空字符串
 *    - 空白搜索返回全部记录
 *    - 空记录数组返回空数组
 *
 * 4. 依赖关系：
 *    - 无外部依赖
 *
 * 5. 使用示例：
 *    import { normalizeSearchInput, isBlankSearch, filterRecordsBySearch } from '@/utils/search';
 *
 *    // 标准化输入
 *    const normalized = normalizeSearchInput('  hello   world  '); // 'hello world'
 *
 *    // 检测空白搜索
 *    const isBlank = isBlankSearch('   '); // true
 *
 *    // 过滤记录（部分匹配）
 *    const filtered = filterRecordsBySearch(records, 'hello', 'partial');
 *
 *    // 过滤记录（精确匹配）
 *    const exactMatch = filterRecordsBySearch(records, 'hello', 'exact');
 *
 * 6. 未来优化方向：
 *    - 添加拼音搜索支持（中文词汇）
 *    - 实现模糊搜索（Fuzzy Search）
 *    - 添加搜索历史记录
 *    - 支持多字段搜索（lemma、释义、词源等）
 * ============================================================================
 */

/**
 * 标准化搜索输入
 * @param {string} value - 原始输入值
 * @returns {string} 标准化后的字符串
 *
 * 处理逻辑：
 * 1. 将输入转为字符串
 * 2. 将所有空白字符（包括全角空格 \u3000）替换为单个半角空格
 * 3. 去除首尾空白
 */
export const normalizeSearchInput = value => {
  const text = String(value ?? '');
  return text.replace(/[\s\u3000]+/g, ' ').trim();
};

/**
 * 检测是否为空白搜索
 * @param {string} value - 搜索输入值
 * @returns {boolean} 是否为空白
 *
 * 先标准化输入，再检测长度是否为 0
 */
export const isBlankSearch = value => {
  return normalizeSearchInput(value).length === 0;
};

/**
 * 根据搜索词过滤记录列表
 * @param {Array} records - 记录列表
 * @param {string} value - 搜索词
 * @param {string} mode - 搜索模式：'partial'（部分匹配）或 'exact'（精确匹配）
 * @returns {Array} 过滤后的记录列表
 *
 * 匹配逻辑：
 * - 支持从 r.lemma 或 r.yield.lemma 获取词汇
 * - 统一转小写后进行比较
 * - 空白搜索返回全部记录
 */
export const filterRecordsBySearch = (records, value, mode = 'partial') => {
  const normalized = normalizeSearchInput(value);

  // 空白搜索返回全部记录
  if (isBlankSearch(normalized)) return records;

  const needle = normalized.toLowerCase();

  // 精确匹配模式
  if (mode === 'exact') {
    return records.filter(r => String(r.lemma || r.yield?.lemma || '').toLowerCase() === needle);
  }

  // 部分匹配模式（默认）
  return records.filter(r =>
    String(r.lemma || r.yield?.lemma || '')
      .toLowerCase()
      .includes(needle)
  );
};
