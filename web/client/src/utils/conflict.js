/**
 * ============================================================================
 * Conflict - 冲突处理与 YAML 格式化工具模块
 * ============================================================================
 *
 * 【功能简介】
 * 本模块提供词汇数据冲突处理相关的工具函数，包括 YAML 格式化和差异分析适配器。
 * 主要用于词汇编辑器的预览功能和冲突检测结果的展示。
 *
 * 核心职责：
 * - YAML 格式化：按固定顺序输出 YAML 字段，确保可读性
 * - 差异分析适配：将差异数据转换为 UI 可用的徽章和模块列表
 * - 支持冲突检测结果的视觉呈现
 *
 * 在整个前端架构中的定位：
 * - 上层：被 WordEditor、ConflictModal 等组件调用
 * - 下层：依赖 js-yaml 库进行 YAML 解析和生成
 * - 设计模式：工具函数集合，采用命名导出
 *
 * 【实现思路】
 * 1. YAML 格式化器（yamlFormatter）：
 *    - 定义固定字段顺序（yield -> etymology -> cognate_family -> application -> nuance）
 *    - 使用 js-yaml 的 dump 方法生成 YAML 字符串
 *    - 配置选项确保输出格式一致（不换行、无引用、双引号）
 *
 * 2. 差异分析适配器（deepDiffAdapter）：
 *    - getBadges: 将差异数组转换为徽章对象（路径、样式类）
 *    - getModules: 提取差异涉及的顶层模块名称
 *    - 使用颜色编码区分差异类型（新增/删除/修改/数组）
 *
 * 3. 差异类型映射：
 *    - N (New): 新增 - 绿色
 *    - D (Deleted): 删除 - 红色
 *    - E (Edited): 修改 - 黄色
 *    - A (Array): 数组变化 - 靛蓝色
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - YAML 格式化依赖固定字段顺序，新增字段需同步更新 keyOrder
 *    - 差异分析假设差异对象的 path 属性为数组格式
 *    - 样式类名硬编码，需与 Tailwind CSS 配置保持一致
 *
 * 2. 性能考虑：
 *    - yaml.dump 操作在大量数据时可能有性能开销
 *    - 差异分析遍历数组，时间复杂度 O(n)
 *
 * 3. 边界条件处理：
 *    - 空对象或 null 输入时的处理
 *    - 空差异数组返回空数组
 *    - 差异路径为空或格式异常时的降级处理
 *
 * 4. 依赖关系：
 *    - 强依赖：js-yaml（YAML 解析和生成）
 *    - 样式依赖：Tailwind CSS（徽章样式类）
 *
 * 5. 使用示例：
 *    import { yamlFormatter, deepDiffAdapter } from '@/utils/conflict';
 *
 *    // 格式化 YAML
 *    const yaml = yamlFormatter.format(data);
 *
 *    // 获取差异徽章
 *    const badges = deepDiffAdapter.getBadges(diffs);
 *
 *    // 获取变更模块
 *    const modules = deepDiffAdapter.getModules(diffs);
 *
 * 6. 未来优化方向：
 *    - 支持自定义 YAML 字段顺序配置
 *    - 添加更多差异类型支持
 *    - 实现差异内容的详细对比展示
 *    - 支持 YAML 注释保留
 * ============================================================================
 */

import yaml from 'js-yaml';

/**
 * YAML 格式化器
 * 按固定顺序格式化 YAML 输出
 */
export const yamlFormatter = {
  /**
   * 格式化对象为 YAML 字符串
   * @param {Object} obj - 要格式化的对象
   * @returns {string} YAML 格式字符串
   *
   * 字段顺序：
   * 1. yield（词汇基本信息）
   * 2. etymology（词源信息）
   * 3. cognate_family（同源词族）
   * 4. application（应用/例句）
   * 5. nuance（近义词辨析）
   * 6. 其他字段（按原顺序）
   */
  format(obj) {
    const orderedObj = {};
    const keyOrder = ['yield', 'etymology', 'cognate_family', 'application', 'nuance'];

    // 按固定顺序添加已知字段
    for (const k of keyOrder) {
      if (obj && obj[k] !== undefined) orderedObj[k] = obj[k];
    }

    // 添加其他未知字段
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        if (!keyOrder.includes(k)) orderedObj[k] = obj[k];
      }
    }

    // 生成 YAML 字符串
    return yaml.dump(orderedObj, {
      lineWidth: -1, // 不限制行宽
      noRefs: true, // 禁用引用标记
      quotingType: '"', // 使用双引号
      forceQuotes: false, // 不强制引号
      sortKeys: false, // 不排序键名
    });
  },
};

/**
 * 差异分析适配器
 * 将 deep-diff 库的差异结果转换为 UI 可用格式
 */
export const deepDiffAdapter = {
  /**
   * 获取差异徽章列表
   * @param {Array} diffs - deep-diff 产生的差异数组
   * @returns {Array} 徽章对象数组 { path: string, cls: string }
   *
   * 差异类型样式：
   * - N (New): bg-green-100 text-green-700 border-green-200
   * - D (Deleted): bg-red-100 text-red-700 border-red-200
   * - E (Edited): bg-yellow-100 text-yellow-700 border-yellow-200
   * - A (Array): bg-indigo-100 text-indigo-700 border-indigo-200
   */
  getBadges(diffs) {
    if (!diffs || !Array.isArray(diffs) || diffs.length === 0) return [];

    return diffs.map(d => {
      // 提取路径字符串
      const path = d.path ? d.path.join('.') : 'root';

      // 默认样式
      let cls = 'bg-slate-100 text-slate-600 border-slate-200';

      // 根据差异类型设置样式
      if (d.kind === 'N') cls = 'bg-green-100 text-green-700 border-green-200';
      if (d.kind === 'D') cls = 'bg-red-100 text-red-700 border-red-200';
      if (d.kind === 'E') cls = 'bg-yellow-100 text-yellow-700 border-yellow-200';
      if (d.kind === 'A') cls = 'bg-indigo-100 text-indigo-700 border-indigo-200';

      return { path, cls };
    });
  },

  /**
   * 获取变更的顶层模块列表
   * @param {Array} diffs - deep-diff 产生的差异数组
   * @returns {Array} 模块名称数组（按固定顺序）
   *
   * 模块顺序：yield -> etymology -> cognate_family -> application -> nuance
   */
  getModules(diffs) {
    if (!diffs || !Array.isArray(diffs) || diffs.length === 0) return [];

    // 收集所有顶层模块
    const set = new Set();
    for (const d of diffs) {
      const top = Array.isArray(d.path) && d.path.length ? String(d.path[0]) : 'root';
      set.add(top);
    }

    // 按固定顺序排列
    const known = ['yield', 'etymology', 'cognate_family', 'application', 'nuance'];
    const ordered = [];

    // 先添加已知模块
    for (const k of known) if (set.has(k)) ordered.push(k);

    // 再添加未知模块
    for (const k of Array.from(set)) if (!known.includes(k)) ordered.push(k);

    return ordered;
  },
};
