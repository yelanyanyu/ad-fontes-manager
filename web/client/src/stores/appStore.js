/**
 * ============================================================================
 * AppStore - 应用全局状态管理模块（Pinia Store）
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是前端应用的全局状态管理器，基于 Pinia 框架实现。
 * 负责管理应用级别的 UI 状态和全局功能，包括侧边栏状态、Toast 通知系统等。
 * 作为 WordStore 的辅助状态管理器，提供与业务数据无关的通用功能。
 *
 * 核心职责：
 * - 管理侧边栏展开/收起状态
 * - 提供全局 Toast 通知系统（成功、错误、信息提示）
 * - 管理全局 UI 状态
 *
 * 在整个前端架构中的定位：
 * - 上层：被所有 Vue 组件调用（通过 useAppStore）
 * - 下层：无外部依赖，纯状态管理
 * - 设计模式：采用 Pinia 的 Option Store 模式
 *
 * 【实现思路】
 * 1. 状态设计原则：
 *    - 保持最小化状态，只存储必要的全局状态
 *    - 侧边栏状态持久化到 localStorage（可扩展）
 *    - Toast 使用数组管理，支持多通知同时显示
 *
 * 2. Toast 通知系统：
 *    - 支持三种类型：info、success、error
 *    - 自动关闭机制（默认 3 秒）
 *    - 手动关闭支持
 *    - 使用 Date.now() 生成唯一 ID
 *
 * 3. 状态持久化考虑：
 *    - 当前侧边栏状态未持久化，页面刷新后重置
 *    - 如需持久化，可使用 pinia-plugin-persistedstate
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - Toast 数组无限增长可能导致内存泄漏（已用 setTimeout 自动清理）
 *    - 频繁切换侧边栏可能触发过多重渲染
 *
 * 2. 性能考虑：
 *    - Toast 使用数组存储，查找删除操作时间复杂度 O(n)
 *    - 对于高频通知场景，考虑使用 Map 存储优化
 *
 * 3. 边界条件处理：
 *    - Toast 消息为空字符串时的处理
 *    - duration 为 0 或负数时的处理（不自动关闭）
 *    - 移除不存在的 Toast ID 时的处理
 *
 * 4. 依赖关系：
 *    - 强依赖：pinia（状态管理框架）
 *    - 无其他外部依赖
 *
 * 5. 使用示例：
 *    const appStore = useAppStore();
 *    appStore.toggleSidebar(); // 切换侧边栏
 *    appStore.addToast('保存成功', 'success'); // 显示成功提示
 *    appStore.addToast('发生错误', 'error', 5000); // 显示错误提示，5秒后关闭
 *
 * 6. 未来优化方向：
 *    - 添加状态持久化（侧边栏状态记住用户偏好）
 *    - 支持 Toast 队列长度限制，防止过多通知
 *    - 添加 Toast 优先级和分组功能
 *    - 支持自定义 Toast 位置和动画
 * ============================================================================
 */

import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
  state: () => ({
    // 侧边栏展开状态
    sidebarOpen: true,

    // Toast 通知列表
    // 格式: { id: number, message: string, type: 'info'|'success'|'error' }
    toasts: [],
  }),

  actions: {
    /**
     * 切换侧边栏展开/收起状态
     * 用于响应侧边栏折叠按钮点击
     */
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },

    /**
     * 添加 Toast 通知
     * @param {string} message - 通知消息内容
     * @param {string} type - 通知类型：'info' | 'success' | 'error'
     * @param {number} duration - 显示时长（毫秒），默认 3000ms，0 表示不自动关闭
     *
     * 使用 Date.now() 生成唯一 ID，支持同时显示多个通知
     */
    addToast(message, type = 'info', duration = 3000) {
      const id = Date.now();
      this.toasts.push({ id, message, type });

      // 设置自动关闭定时器
      if (duration > 0) {
        setTimeout(() => {
          this.removeToast(id);
        }, duration);
      }
    },

    /**
     * 移除指定 Toast 通知
     * @param {number} id - Toast ID
     *
     * 使用 findIndex 查找并 splice 移除，时间复杂度 O(n)
     */
    removeToast(id) {
      const index = this.toasts.findIndex(t => t.id === id);
      if (index !== -1) {
        this.toasts.splice(index, 1);
      }
    },
  },
});
