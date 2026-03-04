/**
 * ============================================================================
 * Template - 轻量级模板引擎模块
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是一个轻量级的模板引擎，提供类似 Handlebars 的语法支持。
 * 用于将数据对象渲染为 HTML 字符串，支持条件渲染（{{#if}}）和循环渲染（{{#each}}）。
 *
 * 核心职责：
 * - 解析模板字符串中的标签
 * - 支持条件渲染（{{#if path}}...{{/if}}）
 * - 支持循环渲染（{{#each path}}...{{/each}}）
 * - 变量插值（{{path}} 和 {{{path}}}）
 * - HTML 转义和 XSS 防护
 *
 * 在整个前端架构中的定位：
 * - 上层：可用于动态生成 HTML 内容
 * - 下层：无外部依赖，纯 JavaScript 实现
 * - 设计模式：递归下降解析器
 *
 * 【实现思路】
 * 1. 模板语法：
 *    - {{#if path}}...{{/if}}: 条件渲染
 *    - {{#each path}}...{{/each}}: 循环渲染
 *    - {{path}}: HTML 转义插值
 *    - {{{path}}}: 原始 HTML 插值（保留 HTML 标签）
 *
 * 2. 解析算法：
 *    - renderSegments: 递归解析模板段落
 *    - findSection: 查找下一个条件或循环标签
 *    - parseTag: 解析标签内容
 *    - findMatchingEnd: 查找匹配的结束标签（支持嵌套）
 *
 * 3. 上下文管理：
 *    - 使用对象传递上下文数据
 *    - 支持 @root 访问根上下文
 *    - each 循环内创建新的上下文（包含当前项和 @root）
 *
 * 4. 安全防护：
 *    - 默认 HTML 转义（{{}}）
 *    - 危险 HTML 标签和事件处理程序过滤
 *    - 原始 HTML 插值需显式使用 {{{}}}
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - 递归解析可能导致栈溢出（已用 MAX_LOOPS 限制）
 *    - 原始 HTML 插值（{{{}}}）存在 XSS 风险
 *    - 复杂嵌套模板可能影响性能
 *
 * 2. 性能考虑：
 *    - 使用字符串拼接而非 DOM 操作
 *    - 循环次数限制防止无限循环
 *    - 正则表达式用于简单替换
 *
 * 3. 边界条件处理：
 *    - 空模板返回空字符串
 *    - 未匹配到结束标签时返回原始内容
 *    - undefined/null 值转为空字符串
 *    - 循环非数组时跳过
 *
 * 4. 依赖关系：
 *    - 无外部依赖
 *
 * 5. 使用示例：
 *    import { renderTemplate } from '@/utils/template';
 *
 *    const template = `
 *      <div>
 *        {{#if user}}
 *          <h1>Hello, {{user.name}}</h1>
 *          {{#each user.items}}
 *            <p>{{this}}</p>
 *          {{/each}}
 *        {{/if}}
 *      </div>
 *    `;
 *
 *    const html = renderTemplate(template, {
 *      user: { name: 'John', items: ['A', 'B', 'C'] }
 *    });
 *
 * 6. 限制说明：
 *    - 不支持表达式（如 {{a + b}}）
 *    - 不支持自定义 Helper
 *    - 不支持部分模板（Partial）
 *    - 不支持模板继承
 *
 * 7. 未来优化方向：
 *    - 添加表达式支持
 *    - 实现模板预编译
 *    - 添加更多内置 Helper
 *    - 支持异步数据加载
 * ============================================================================
 */

/**
 * HTML 转义函数
 * @param {any} value - 要转义的值
 * @returns {string} 转义后的 HTML 字符串
 *
 * 转义字符：& < > " '
 */
function escapeHtml(value) {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML 转义并保留换行
 * @param {any} value - 要转义的值
 * @returns {string} 转义后的 HTML 字符串，换行转为 <br>
 */
function escapeWithLineBreaks(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * 安全获取对象路径值
 * @param {Object} obj - 数据对象
 * @param {string} path - 属性路径（如 'a.b.c'）
 * @returns {any} 路径对应的值，不存在返回空字符串
 *
 * 特殊路径：
 * - 'this': 返回当前上下文
 * - '@root.xxx': 从根上下文获取
 */
function getPath(obj, path) {
  if (!path) return '';
  if (path === 'this') return obj?.this ?? '';
  if (path.startsWith('@root.')) {
    return getPath({ this: obj?.['@root'], '@root': obj?.['@root'] }, path.slice(6));
  }
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return '';
    cur = cur[p];
  }
  return cur ?? '';
}

/**
 * 过滤危险 HTML 内容
 * @param {string} html - HTML 字符串
 * @returns {string} 过滤后的安全 HTML
 *
 * 移除内容：
 * - <script> 标签及其内容
 * - 事件处理程序（如 onclick="..."）
 */
function stripDangerousHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
}

/**
 * 查找下一个区块标签（if 或 each）
 * @param {string} template - 模板字符串
 * @param {number} startIndex - 开始搜索位置
 * @returns {Object|null} 找到的区块信息 { type, index }
 */
function findSection(template, startIndex) {
  const eachIdx = template.indexOf('{{#each', startIndex);
  const ifIdx = template.indexOf('{{#if', startIndex);
  if (eachIdx === -1 && ifIdx === -1) return null;
  if (eachIdx !== -1 && (ifIdx === -1 || eachIdx < ifIdx)) return { type: 'each', index: eachIdx };
  return { type: 'if', index: ifIdx };
}

/**
 * 解析标签内容
 * @param {string} template - 模板字符串
 * @param {number} tagStart - 标签开始位置
 * @param {string} type - 标签类型（if 或 each）
 * @returns {Object|null} 解析结果 { path, tagEnd }
 */
function parseTag(template, tagStart, type) {
  const close = template.indexOf('}}', tagStart);
  if (close === -1) return null;
  const raw = template.slice(tagStart + `{{#${type}`.length, close).trim();
  return { path: raw, tagEnd: close + 2 };
}

/**
 * 查找匹配的结束标签
 * @param {string} template - 模板字符串
 * @param {number} fromIndex - 开始搜索位置
 * @param {string} type - 标签类型（if 或 each）
 * @returns {number} 结束标签位置，未找到返回 -1
 *
 * 支持嵌套标签匹配
 */
function findMatchingEnd(template, fromIndex, type) {
  const openTag = `{{#${type}`;
  const closeTag = `{{/${type}}}`;
  let depth = 1;
  let i = fromIndex;
  while (i < template.length) {
    const nextOpen = template.indexOf(openTag, i);
    const nextClose = template.indexOf(closeTag, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + openTag.length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose;
    i = nextClose + closeTag.length;
  }
  return -1;
}

/**
 * 递归渲染模板段落
 * @param {string} template - 模板字符串
 * @param {Object} ctx - 上下文数据
 * @returns {string} 渲染后的 HTML
 *
 * 递归处理 if/each 区块，然后进行变量插值
 */
function renderSegments(template, ctx) {
  let out = '';
  let cursor = 0;
  let loopCount = 0;
  const MAX_LOOPS = 10000; // 防止无限循环

  while (true) {
    if (++loopCount > MAX_LOOPS) {
      console.warn('Template render infinite loop detected');
      break;
    }

    // 查找下一个区块
    const section = findSection(template, cursor);
    if (!section) {
      out += template.slice(cursor);
      break;
    }

    // 添加区块前的内容
    out += template.slice(cursor, section.index);

    // 解析标签
    const parsed = parseTag(template, section.index, section.type);
    if (!parsed) {
      out += template.slice(section.index);
      break;
    }

    const blockStart = parsed.tagEnd;
    const endIdx = findMatchingEnd(template, blockStart, section.type);
    if (endIdx === -1) {
      out += template.slice(section.index);
      break;
    }

    // 提取区块内容
    const inner = template.slice(blockStart, endIdx);
    const afterEnd = endIdx + `{{/${section.type}}}`.length;

    // 渲染区块
    if (section.type === 'if') {
      // 条件渲染
      const val = getPath(ctx, parsed.path);
      if (val) out += renderSegments(inner, ctx);
    } else if (section.type === 'each') {
      // 循环渲染
      const arr = getPath(ctx, parsed.path);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          // 创建新的上下文
          const nextCtx = {
            ...ctx,
            ...(item && typeof item === 'object' ? item : {}),
            this: item,
            '@root': ctx['@root'],
          };
          out += renderSegments(inner, nextCtx);
        }
      }
    }

    cursor = afterEnd;
  }

  // 原始 HTML 插值（保留 HTML 标签，但过滤危险内容）
  out = out.replace(/\{\{\{([\s\S]+?)\}\}\}/g, (_, expr) => {
    const val = getPath(ctx, String(expr).trim());
    return stripDangerousHtml(String(val ?? ''));
  });

  // HTML 转义插值（默认安全）
  out = out.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr) => {
    const val = getPath(ctx, String(expr).trim());
    return escapeWithLineBreaks(val);
  });

  return out;
}

/**
 * 渲染模板
 * @param {string} template - 模板字符串
 * @param {Object} data - 数据对象
 * @returns {string} 渲染后的 HTML 字符串
 *
 * 入口函数，先过滤危险 HTML，然后递归渲染
 */
export function renderTemplate(template, data) {
  const safeTemplate = stripDangerousHtml(template);
  const ctx = { ...data, this: data, '@root': data };
  return renderSegments(safeTemplate, ctx);
}
