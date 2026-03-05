import type { ComputedRef } from 'vue';
import request from '@/utils/request';
import yaml from 'js-yaml';
import { wordLogger } from '@/utils/logger';
import type { WordRecord } from '@/types/word-list';

interface WordStoreLike {
  setEditorYaml: (yaml: string) => void;
  setEditingContext: (context: { id: string | null; isLocal: boolean }) => void;
}

interface UseWordEditorLoaderParams {
  displayedRecords: ComputedRef<WordRecord[]>;
  wordStore: WordStoreLike;
}

export const useWordEditorLoader = ({ displayedRecords, wordStore }: UseWordEditorLoaderParams) => {
  const formatYamlForEditor = (yamlObj: unknown): string => {
    const orderedObj: Record<string, unknown> = {};
    const keyOrder = ['yield', 'etymology', 'cognate_family', 'application', 'nuance'];
    const source =
      yamlObj && typeof yamlObj === 'object' ? (yamlObj as Record<string, unknown>) : {};

    for (const k of keyOrder) {
      if (source[k] !== undefined) orderedObj[k] = source[k];
    }
    for (const k of Object.keys(source)) {
      if (!keyOrder.includes(k)) orderedObj[k] = source[k];
    }

    return yaml.dump(orderedObj, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
      sortKeys: false,
    });
  };

  const loadDbRecordByLemma = async (lemma: string | undefined): Promise<boolean> => {
    if (!lemma) return false;
    try {
      const res = await request.get('/words', {
        params: { search: String(lemma), page: 1, limit: 20, sort: 'newest' },
        skipErrorToast: true,
      });
      const items: Array<{ id?: string; lemma?: string; original_yaml?: unknown }> = Array.isArray(
        res?.items
      )
        ? res.items
        : Array.isArray(res)
          ? res
          : [];
      const target = String(lemma).toLowerCase();
      const match = items.find(i => String(i.lemma || '').toLowerCase() === target);
      if (match && match.id) {
        const full = await request.get(`/words/${encodeURIComponent(match.id)}`, {
          skipErrorToast: true,
        });
        if (full && full.original_yaml) {
          const obj =
            typeof full.original_yaml === 'string'
              ? (yaml.load(full.original_yaml) as unknown)
              : (full.original_yaml as unknown);
          wordStore.setEditorYaml(formatYamlForEditor(obj));
          wordStore.setEditingContext({ id: match.id, isLocal: false });
          return true;
        }
      }
    } catch {
      // noop
    }
    return false;
  };

  const loadIntoEditor = async (id: string): Promise<void> => {
    const item = displayedRecords.value.find(r => r.id === id);
    if (!item) {
      wordLogger.warn(`[loadIntoEditor] 未找到 ID 为 ${id} 的词条`);
      return;
    }

    wordLogger.debug(
      `[loadIntoEditor] 开始加载词条: ${item.lemma}, 来源: ${item.isLocal ? '本地' : '数据库'}`
    );

    if (item.isLocal) {
      try {
        const rawYaml = String(item.raw_yaml || item.original_yaml || '');
        wordLogger.debug(`[loadIntoEditor] 本地词条 rawYaml 长度: ${rawYaml.length}`);
        const obj = yaml.load(rawYaml);
        wordLogger.debug('[loadIntoEditor] 本地词条解析后 obj:', obj);
        const formatted = formatYamlForEditor(obj);
        wordLogger.debug(`[loadIntoEditor] 本地词条格式化后长度: ${formatted.length}`);
        wordStore.setEditorYaml(formatted);
        wordLogger.debug(`[loadIntoEditor] 本地词条 YAML 解析成功: ${id}`);
      } catch (e) {
        wordLogger.warn(`[loadIntoEditor] 本地词条 YAML 解析失败，使用原始文本: ${id}`, e);
        const rawYaml = String(item.raw_yaml || item.original_yaml || '');
        wordStore.setEditorYaml(rawYaml);
      }
      wordStore.setEditingContext({ id, isLocal: true });
      wordLogger.debug(`[loadIntoEditor] 本地词条已加载到编辑器: ${id}`);
      return;
    }

    try {
      const full = await request.get(`/words/${encodeURIComponent(id)}`, { skipErrorToast: true });
      wordLogger.debug(
        `[loadIntoEditor] 成功从 API 获取 full: ${full?.lemma}, original_yaml 长度: ${full?.original_yaml?.length}`
      );
      if (full && full.original_yaml) {
        const obj =
          typeof full.original_yaml === 'string'
            ? (yaml.load(full.original_yaml) as unknown)
            : (full.original_yaml as unknown);
        wordLogger.debug('[loadIntoEditor] 数据库词条解析后 obj:', obj);
        const formatted = formatYamlForEditor(obj);
        wordLogger.debug(`[loadIntoEditor] 数据库词条格式化后长度: ${formatted.length}`);
        wordStore.setEditorYaml(formatted);
        wordStore.setEditingContext({ id, isLocal: false });
        wordLogger.debug(`[loadIntoEditor] 数据库词条已加载（从 API）: ${id}`);
        return;
      }
    } catch (e) {
      wordLogger.warn(`[loadIntoEditor] 从 API 获取词条失败: ${id}`, e);
    }

    if (item.original_yaml) {
      try {
        const obj =
          typeof item.original_yaml === 'string'
            ? (yaml.load(item.original_yaml) as unknown)
            : (item.original_yaml as unknown);
        wordStore.setEditorYaml(formatYamlForEditor(obj));
        wordLogger.debug(`[loadIntoEditor] 数据库词条已加载（从缓存）: ${id}`);
      } catch (e) {
        wordLogger.warn(`[loadIntoEditor] 缓存 YAML 解析失败: ${id}`, e);
        const txt =
          typeof item.original_yaml === 'string'
            ? item.original_yaml
            : yaml.dump(item.original_yaml, { lineWidth: -1, noRefs: true });
        wordStore.setEditorYaml(txt);
      }
      wordStore.setEditingContext({ id, isLocal: false });
      return;
    }

    try {
      const full = await request.get(`/words/${encodeURIComponent(id)}`, { skipErrorToast: true });
      if (full && full.original_yaml) {
        try {
          const obj =
            typeof full.original_yaml === 'string'
              ? (yaml.load(full.original_yaml) as unknown)
              : (full.original_yaml as unknown);
          wordStore.setEditorYaml(formatYamlForEditor(obj));
          wordLogger.debug(`[loadIntoEditor] 数据库词条已加载（二次 API 请求）: ${id}`);
        } catch (e) {
          wordLogger.warn(`[loadIntoEditor] YAML 解析失败，使用原始文本: ${id}`, e);
          const txt =
            typeof full.original_yaml === 'string'
              ? full.original_yaml
              : yaml.dump(full.original_yaml, { lineWidth: -1, noRefs: true });
          wordStore.setEditorYaml(txt);
        }
        wordStore.setEditingContext({ id, isLocal: false });
      } else {
        wordLogger.error(`[loadIntoEditor] 词条数据为空: ${id}`);
      }
    } catch (e) {
      wordLogger.error(`[loadIntoEditor] 加载词条失败: ${id}`, e);
    }
  };

  return {
    formatYamlForEditor,
    loadDbRecordByLemma,
    loadIntoEditor,
  };
};
