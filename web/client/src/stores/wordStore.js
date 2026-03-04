/**
 * ============================================================================
 * WordStore - 词汇状态管理模块（Pinia Store）
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是前端词汇管理系统的核心状态管理器，基于 Pinia 框架实现。
 * 负责管理词汇数据的完整生命周期，包括本地草稿、数据库记录、连接状态、
 * 编辑器状态等。实现了离线优先的数据策略，确保用户在无网络环境下
 * 仍可正常使用核心功能。
 *
 * 核心职责：
 * - 管理数据库连接状态（connected/disconnected/testing）
 * - 维护本地草稿和数据库记录的双向数据流
 * - 提供词汇的增删改查操作
 * - 实现智能保存策略（自动判断保存到本地或数据库）
 * - 支持数据同步检查与执行
 *
 * 在整个前端架构中的定位：
 * - 上层：被 Vue 组件调用（WordList、WordEditor、HomeView 等）
 * - 下层：调用 request 工具进行 HTTP 通信
 * - 同级：依赖 appStore 进行全局提示（Toast）
 * - 设计模式：采用 Pinia 的 Option Store 模式
 *
 * 【实现思路】
 * 1. 状态设计原则：
 *    - 分离本地数据(localRecords)和数据库数据(dbRecords)
 *    - 维护连接状态(connectionStatus)实现 UI 状态同步
 *    - 编辑器状态独立管理(currentEditingId/isLocal/editorYaml)
 *
 * 2. 离线优先策略：
 *    - 自动检测数据库连接状态
 *    - 连接断开时自动降级到本地存储
 *    - 恢复连接后可手动同步数据
 *
 * 3. 智能保存逻辑：
 *    - target='auto' 时自动判断保存目标
 *    - 优先保存到当前编辑来源（本地/数据库）
 *    - 支持强制指定保存目标
 *
 * 4. 错误处理机制：
 *    - 使用 skipErrorToast 避免重复错误提示
 *    - 网络错误自动降级到本地保存
 *    - 统一错误处理和用户反馈
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - 并发保存可能导致数据冲突（已通过冲突检测机制缓解）
 *    - 大量本地记录可能影响内存占用
 *    - 连接状态检测依赖 /status 接口，频繁调用可能增加服务器负担
 *
 * 2. 性能考虑：
 *    - dbListMeta 维护分页状态，避免重复请求
 *    - fetchDbRecords 使用 loading 状态防止重复提交
 *    - 本地记录映射转换在获取时进行，避免重复计算
 *
 * 3. 边界条件处理：
 *    - 空搜索结果的处理（dbRecords = [], meta 重置）
 *    - 网络错误时的优雅降级
 *    - 保存冲突时的返回处理（status='conflict'）
 *
 * 4. 依赖关系：
 *    - 强依赖：pinia（状态管理）、request（HTTP 请求）、appStore（全局提示）
 *    - 接口依赖：/status、/local、/words、/sync/* 等后端接口
 *
 * 5. 数据流说明：
 *    本地草稿流：fetchLocalRecords -> localRecords -> saveWord(local) -> 更新
 *    数据库流：fetchDbRecords -> dbRecords -> saveWord(db) -> 更新
 *    编辑器流：setEditingContext -> editorYaml -> saveWord -> 重置/更新
 *
 * 6. 未来优化方向：
 *    - 引入 IndexedDB 替代内存存储本地草稿，支持更大容量
 *    - 实现自动同步机制，恢复连接后自动上传本地草稿
 *    - 添加操作历史记录，支持撤销/重做
 *    - 考虑使用 Pinia 的 persist 插件实现状态持久化
 * ============================================================================
 */

import { defineStore } from 'pinia';
import request from '@/utils/request';
import { useAppStore } from '@/stores/appStore';

export const useWordStore = defineStore('word', {
  state: () => ({
    // 数据库连接状态
    dbConnected: false,
    connectionStatus: 'disconnected', // 'disconnected' | 'testing' | 'connected'

    // 本地草稿记录（离线状态使用）
    localRecords: [],

    // 数据库记录列表
    dbRecords: [],

    // 分页和搜索状态
    dbListMeta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      search: '',
      sort: 'newest',
    },

    // 编辑器状态
    currentEditingId: null, // 当前编辑的词汇ID
    currentEditingIsLocal: false, // 当前编辑的是否为本地草稿
    editorYaml: '', // 编辑器中的YAML内容

    // 加载状态
    loading: false,
  }),

  actions: {
    /**
     * 检查数据库连接状态
     * 用于页面加载时的自动连接检测
     * 静默执行，不显示错误提示
     */
    async checkConnection() {
      try {
        this.connectionStatus = 'testing';
        await request.get('/status', { skipErrorToast: true });
        this.dbConnected = true;
        this.connectionStatus = 'connected';
      } catch (e) {
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
      }
    },

    /**
     * 测试指定数据库连接
     * @param {string} dbUrl - 可选的数据库连接URL
     * @returns {Object} 连接结果 { connected: boolean, error?: string }
     *
     * 用于设置页面的连接测试功能
     */
    async testConnection(dbUrl) {
      try {
        this.connectionStatus = 'testing';
        const res = await request.get('/status', {
          headers: dbUrl ? { 'x-db-url': dbUrl } : {},
          skipErrorToast: true,
        });
        if (res && res.connected) {
          this.dbConnected = true;
          this.connectionStatus = 'connected';
          return { connected: true };
        }
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
        return { connected: false, error: res?.error };
      } catch (e) {
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
        return { connected: false, error: e?.message };
      }
    },

    /**
     * 获取本地草稿记录列表
     * 数据映射：统一字段名（lemma_preview -> lemma, raw_yaml -> original_yaml）
     */
    async fetchLocalRecords() {
      try {
        const res = await request.get('/local', { skipErrorToast: true });
        this.localRecords = (res || []).map(r => ({
          ...r,
          isLocal: true,
          lemma: r.lemma || r.lemma_preview,
          original_yaml: r.original_yaml || r.raw_yaml,
        }));
      } catch (e) {}
    },

    /**
     * 获取数据库记录列表（支持分页、搜索、排序）
     * @param {Object} params - 查询参数（page, limit, search, sort）
     *
     * 自动处理分页元数据，支持服务端分页和客户端分页两种模式
     */
    async fetchDbRecords(params = {}) {
      this.loading = true;
      try {
        const p = { ...this.dbListMeta, ...params };
        const res = await request.get('/words', {
          params: {
            page: p.page,
            limit: p.limit,
            search: p.search,
            sort: p.sort,
          },
          skipErrorToast: true,
        });

        this.dbConnected = true;
        this.connectionStatus = 'connected';

        if (res.items) {
          // 服务端分页模式
          this.dbRecords = res.items;
          this.dbListMeta = {
            page: res.page,
            limit: res.limit,
            total: res.total,
            totalPages: res.totalPages,
            search: p.search,
            sort: p.sort,
          };
        } else {
          // 客户端分页模式（兼容旧接口）
          this.dbRecords = res;
          this.dbListMeta.total = res.length;
        }
      } catch (e) {
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
        this.dbRecords = [];
        this.dbListMeta = {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          search: '',
          sort: 'newest',
        };
      } finally {
        this.loading = false;
      }
    },

    /**
     * 设置编辑器 YAML 内容
     * @param {string} yamlText - YAML 文本内容
     */
    setEditorYaml(yamlText) {
      this.editorYaml = yamlText || '';
    },

    /**
     * 设置编辑上下文
     * @param {Object} context - 编辑上下文
     * @param {string|number} context.id - 词汇ID
     * @param {boolean} context.isLocal - 是否为本地草稿
     */
    setEditingContext({ id, isLocal }) {
      this.currentEditingId = id || null;
      this.currentEditingIsLocal = !!isLocal;
    },

    /**
     * 保存词汇（智能路由到本地或数据库）
     * @param {string} yamlContent - YAML 格式内容
     * @param {boolean} force - 是否强制更新（忽略冲突）
     * @param {string} target - 保存目标：'auto' | 'local' | 'db'
     * @returns {boolean|Object} 保存结果，冲突时返回冲突详情
     *
     * 保存策略：
     * 1. target='auto' 时，优先保存到当前编辑来源
     * 2. 当前编辑来源为本地时，保存到本地
     * 3. 数据库连接正常时，保存到数据库
     * 4. 数据库连接断开时，降级到本地保存
     * 5. 保存失败（500错误）时，自动重试本地保存
     */
    async saveWord(yamlContent, force = false, target = 'auto') {
      const appStore = useAppStore();
      const resolvedTarget =
        target === 'auto'
          ? this.currentEditingIsLocal
            ? 'local'
            : this.dbConnected
              ? 'db'
              : 'local'
          : target;

      // 保存到本地
      if (resolvedTarget === 'local') {
        try {
          const localId = this.currentEditingIsLocal ? this.currentEditingId : null;
          const localRes = await request.post(
            '/local',
            { yaml: yamlContent, id: localId, forceUpdate: !!force },
            { skipErrorToast: true }
          );

          if (localRes && localRes.status === 'conflict') {
            return { ...localRes, source: 'local' };
          }

          if (localRes && localRes.success) {
            appStore.addToast('Saved Locally (Offline)', 'success');
            await this.fetchLocalRecords();
            if (localRes.id) this.setEditingContext({ id: localRes.id, isLocal: true });
            return true;
          }

          appStore.addToast('Local save failed', 'error');
          return false;
        } catch (e) {
          appStore.addToast('Local save failed', 'error');
          return false;
        }
      }

      // 保存到数据库
      try {
        const res = await request.post(
          '/words',
          { yaml: yamlContent, force },
          { skipErrorToast: true }
        );
        if (res && res.status === 'conflict') return { ...res, source: 'db' };
        if (res && res.success) {
          appStore.addToast(`Word "${res.lemma}" saved!`, 'success');
          this.fetchLocalRecords();
          this.fetchDbRecords();
          this.setEditingContext({ id: null, isLocal: false });
          return true;
        }
        return false;
      } catch (e) {
        // 服务器错误时降级到本地保存
        if (e.response && e.response.status === 500) {
          this.dbConnected = false;
          this.connectionStatus = 'disconnected';
          const localRes = await this.saveWord(yamlContent, force, 'local');
          if (localRes && localRes.status === 'conflict') return localRes;
          if (localRes === true) {
            this.dbRecords = [];
            this.dbListMeta = {
              page: 1,
              limit: 20,
              total: 0,
              totalPages: 1,
              search: '',
              sort: 'newest',
            };
            return true;
          }
          appStore.addToast('数据库未连接，本地保存失败', 'error');
          return false;
        }
        appStore.addToast(e.message || 'Save failed', 'error');
        return false;
      }
    },

    /**
     * 删除词汇
     * @param {string|number} id - 词汇ID
     * @param {boolean} isLocal - 是否为本地草稿
     */
    async deleteWord(id, isLocal) {
      const appStore = useAppStore();
      try {
        const endpoint = isLocal ? `/local/${id}` : `/words/${id}`;
        await request.delete(endpoint, { skipErrorToast: true });
        appStore.addToast('Deleted successfully', 'success');
        if (isLocal) this.fetchLocalRecords();
        else this.fetchDbRecords();
      } catch (e) {
        appStore.addToast('Delete failed', 'error');
      }
    },

    /**
     * 检查同步状态
     * @param {Array} items - 要检查的本地记录
     * @returns {Object} 同步检查结果
     */
    async syncCheck(items) {
      return await request.post('/sync/check', { items }, { skipErrorToast: true });
    },

    /**
     * 执行同步操作
     * @param {Array} items - 要同步的记录
     * @param {boolean} forceUpdate - 是否强制更新
     * @returns {Object} 同步执行结果
     */
    async syncExecute(items, forceUpdate) {
      return await request.post(
        '/sync/execute',
        { items, forceUpdate: !!forceUpdate },
        { skipErrorToast: true }
      );
    },
  },
});
