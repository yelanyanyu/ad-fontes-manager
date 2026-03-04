/**
 * ============================================================================
 * WordStore - 词汇状态管理模块（Pinia Store）
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是前端词汇管理系统的核心状态管理器，基于 Pinia 框架实现。
 * 负责管理词汇数据的完整生命周期，包括本地草稿、数据库记录、编辑器状态等。
 * 实现了离线优先的数据策略，确保用户在无网络环境下仍可正常使用核心功能。
 *
 * 【架构说明】
 * 前后端彻底分离后，前端不再直接管理数据库连接配置。
 * 后端直接从配置读取数据库连接信息，前端仅通过 API 与后端通信。
 * 前端保留连接状态检测，用于 UI 显示和离线模式切换。
 *
 * 【核心职责】
 * - 维护本地草稿和数据库记录的双向数据流
 * - 提供词汇的增删改查操作
 * - 实现智能保存策略（自动判断保存到本地或数据库）
 * - 支持数据同步检查与执行
 * - 检测后端数据库连接状态
 *
 * 【数据流说明】
 * 本地草稿流：fetchLocalRecords -> localRecords -> saveWord(local) -> 更新
 * 数据库流：fetchDbRecords -> dbRecords -> saveWord(db) -> 更新
 * 编辑器流：setEditingContext -> editorYaml -> saveWord -> 重置/更新
 * ============================================================================
 */

import { defineStore } from 'pinia';
import request from '@/utils/request';
import { useAppStore } from '@/stores/appStore';
import { wordLogger, syncLogger, dbLogger } from '@/utils/logger';

export const useWordStore = defineStore('word', {
  state: () => ({
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

    // 数据库连接状态（用于UI显示）
    dbConnected: false, // 是否连接到数据库
    connectionStatus: 'disconnected', // 连接状态：'connected' | 'disconnected' | 'testing'

    // 加载状态
    loading: false,
  }),

  actions: {
    /**
     * 检查数据库连接状态
     * 通过调用后端 /status 接口检测连接
     */
    async checkConnection() {
      dbLogger.debug('Checking database connection...');
      try {
        this.connectionStatus = 'testing';
        const res = await request.get('/status', { skipErrorToast: true });
        this.dbConnected = res.connected === true;
        this.connectionStatus = this.dbConnected ? 'connected' : 'disconnected';
        dbLogger.info(`Database ${this.dbConnected ? 'connected' : 'disconnected'}`);
      } catch (e) {
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
        dbLogger.warn('Database connection check failed', { error: e?.message });
      }
    },

    /**
     * 获取本地草稿记录
     * 从后端本地存储获取草稿数据
     */
    async fetchLocalRecords() {
      wordLogger.debug('Fetching local records...');
      try {
        const res = await request.get('/local', { skipErrorToast: true });
        this.localRecords = (res || []).map(r => ({
          ...r,
          isLocal: true,
          lemma: r.lemma || r.lemma_preview,
          original_yaml: r.original_yaml || r.raw_yaml,
        }));
        wordLogger.info(`Loaded ${this.localRecords.length} local records`);
      } catch (e) {
        wordLogger.error('Failed to fetch local records', e);
      }
    },

    /**
     * 获取数据库记录列表
     * 支持分页、搜索、排序
     * @param {Object} params - 查询参数
     */
    async fetchDbRecords(params = {}) {
      this.loading = true;
      wordLogger.debug('Fetching database records...', params);
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
          wordLogger.info(
            `Loaded ${res.items.length} records from database (page ${res.page}/${res.totalPages})`
          );
        } else {
          // 客户端分页模式（兼容旧接口）
          this.dbRecords = res;
          this.dbListMeta.total = res.length;
          wordLogger.info(`Loaded ${res.length} records from database`);
        }
        // 获取成功说明数据库连接正常
        this.dbConnected = true;
        this.connectionStatus = 'connected';
      } catch (e) {
        this.dbRecords = [];
        this.dbListMeta = {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          search: '',
          sort: 'newest',
        };
        this.dbConnected = false;
        this.connectionStatus = 'disconnected';
        wordLogger.error('Failed to fetch database records', e);
      } finally {
        this.loading = false;
      }
    },

    /**
     * 保存词汇
     * 智能判断保存目标（本地或数据库）
     * @param {string} yamlContent - YAML 格式的词汇内容
     * @param {boolean} force - 是否强制更新（忽略冲突）
     * @param {string} target - 保存目标：'local' | 'db' | 'auto'
     * @returns {Object|boolean} 保存结果
     */
    async saveWord(yamlContent, force = false, target = 'auto') {
      const appStore = useAppStore();

      // 解析 YAML 内容获取单词信息
      let lemma = 'unknown';
      let parsedYaml = null;
      try {
        const yaml = await import('js-yaml');
        parsedYaml = yaml.load(yamlContent);
        lemma = parsedYaml?.yield?.lemma || 'unknown';
      } catch (err) {
        // YAML 解析失败，显示错误并阻止保存
        wordLogger.error('YAML parse error in saveWord', { error: err.message });
        appStore.addToast(`Invalid YAML: ${err.message}`, 'error');
        return false;
      }

      // 验证必需的字段
      if (!parsedYaml?.yield?.lemma) {
        wordLogger.error('YAML missing yield.lemma');
        appStore.addToast('YAML missing yield.lemma', 'error');
        return false;
      }

      // 确定保存目标
      const resolvedTarget =
        target === 'auto'
          ? this.currentEditingIsLocal
            ? 'local'
            : this.dbConnected
              ? 'db'
              : 'local'
          : target;

      wordLogger.debug('Saving word...', {
        target: resolvedTarget,
        force,
        isEditing: !!this.currentEditingId,
        lemma,
        contentLength: yamlContent?.length || 0,
      });

      // 保存到本地
      if (resolvedTarget === 'local') {
        try {
          const localId = this.currentEditingIsLocal ? this.currentEditingId : null;
          wordLogger.debug('Saving to local storage', {
            localId,
            lemma,
            payload: {
              yaml: yamlContent?.substring(0, 500) + (yamlContent?.length > 500 ? '...' : ''),
              id: localId,
              forceUpdate: !!force,
            },
          });
          const localRes = await request.post(
            '/local',
            { yaml: yamlContent, id: localId, forceUpdate: !!force },
            { skipErrorToast: true }
          );

          if (localRes && localRes.status === 'conflict') {
            wordLogger.warn('Local save conflict detected', { localId, lemma });
            return { ...localRes, source: 'local' };
          }

          if (localRes && localRes.success) {
            wordLogger.success('Word saved to local storage', { id: localRes.id, lemma });
            appStore.addToast('Saved Locally (Offline)', 'success');
            await this.fetchLocalRecords();
            if (localRes.id) this.setEditingContext({ id: localRes.id, isLocal: true });
            return true;
          }

          wordLogger.error('Local save failed', { localId, lemma, response: localRes });
          appStore.addToast('Local save failed', 'error');
          return false;
        } catch (e) {
          wordLogger.error('Local save error', { lemma, error: e?.message });
          appStore.addToast('Local save failed', 'error');
          return false;
        }
      }

      // 保存到数据库
      try {
        wordLogger.debug('Saving to database...', {
          lemma,
          payload: {
            yaml: yamlContent?.substring(0, 500) + (yamlContent?.length > 500 ? '...' : ''),
            force,
          },
        });
        const res = await request.post(
          '/words',
          { yaml: yamlContent, force },
          { skipErrorToast: true }
        );
        // 处理错误响应
        if (res && res.error) {
          wordLogger.error('Database save failed', { lemma, error: res.error });
          appStore.addToast(`Save failed: ${res.error}`, 'error');
          return false;
        }
        if (res && res.status === 'conflict') {
          wordLogger.warn('Database save conflict detected', {
            lemma: res.lemma,
            diff: res.diff,
          });
          return { ...res, source: 'db' };
        }
        if (res && res.success) {
          wordLogger.success(`Word "${res.lemma}" saved to database`, {
            id: res.id,
            lemma: res.lemma,
            status: res.status,
          });
          appStore.addToast(`Word "${res.lemma}" saved!`, 'success');
          this.fetchLocalRecords();
          this.fetchDbRecords();
          this.setEditingContext({ id: null, isLocal: false });
          return true;
        }
        wordLogger.error('Database save failed', { lemma, response: res });
        return false;
      } catch (e) {
        // 服务器错误时降级到本地保存
        if (e.response && e.response.status === 500) {
          wordLogger.warn('Database connection lost, falling back to local save', { lemma });
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
        wordLogger.error('Save error', { lemma, error: e?.message });
        appStore.addToast(e.message || 'Save failed', 'error');
        return false;
      }
    },

    /**
     * 删除词汇
     * @param {string|number} id - 词汇 ID
     * @param {boolean} isLocal - 是否为本地草稿
     */
    async deleteWord(id, isLocal) {
      const appStore = useAppStore();

      // 获取要删除的单词信息
      let wordInfo = null;
      if (isLocal) {
        wordInfo = this.localRecords.find(r => r.id === id);
      } else {
        wordInfo = this.dbRecords.find(r => r.id === id);
      }
      const lemma = wordInfo?.lemma || `ID:${id}`;

      wordLogger.debug('Deleting word...', { id, isLocal, lemma });

      try {
        const endpoint = isLocal ? `/local/${id}` : `/words/${id}`;
        await request.delete(endpoint, { skipErrorToast: true });
        wordLogger.success(`Word "${lemma}" deleted from ${isLocal ? 'local' : 'database'}`, {
          id,
          lemma,
        });
        appStore.addToast('Deleted successfully', 'success');
        if (isLocal) this.fetchLocalRecords();
        else this.fetchDbRecords();
      } catch (e) {
        wordLogger.error('Delete word failed', { id, lemma, isLocal, error: e?.message });
        appStore.addToast('Delete failed', 'error');
      }
    },

    /**
     * 设置编辑器上下文
     * @param {Object} context - 编辑器上下文
     * @param {string|number} context.id - 词汇 ID
     * @param {boolean} context.isLocal - 是否为本地草稿
     * @param {string} context.yaml - YAML 内容
     */
    setEditingContext({ id = null, isLocal = false, yaml = '' } = {}) {
      this.currentEditingId = id;
      this.currentEditingIsLocal = isLocal;
      this.editorYaml = yaml;
      wordLogger.debug('Editing context set', { id, isLocal, yamlLength: yaml?.length });
    },

    /**
     * 检查同步状态
     * @param {Array} items - 需要检查的本地草稿列表
     * @returns {Array} 同步检查结果
     */
    async syncCheck(items) {
      syncLogger.debug('Checking sync status...', { itemCount: items?.length });
      try {
        const res = await request.post('/sync/check', { items }, { skipErrorToast: true });
        syncLogger.info('Sync check completed', { result: res?.status });
        return res;
      } catch (e) {
        syncLogger.error('Sync check failed', e);
        throw e;
      }
    },

    /**
     * 执行同步
     * @param {Array} items - 需要同步的本地草稿列表
     * @param {boolean} forceUpdate - 是否强制更新
     * @returns {Object} 同步结果
     */
    async syncExecute(items, forceUpdate) {
      syncLogger.debug('Executing sync...', { itemCount: items?.length, forceUpdate });
      try {
        const res = await request.post(
          '/sync/execute',
          { items, forceUpdate: !!forceUpdate },
          { skipErrorToast: true }
        );
        syncLogger.success('Sync executed successfully', { result: res?.status });
        return res;
      } catch (e) {
        syncLogger.error('Sync execution failed', e);
        throw e;
      }
    },
  },
});
