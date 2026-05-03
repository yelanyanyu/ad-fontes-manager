import type { ComputedRef } from 'vue';
import request from '@/utils/request';
import yaml from 'js-yaml';
import { wordLogger } from '@/utils/logger';
import { useAppStore } from '@/stores/appStore';
import type { WordRecord } from '@/types/word-list';

interface WordStoreLike {
  setEditorYaml: (yaml: string) => void;
  setEditingContext: (context: { id: string | null; isLocal: boolean }) => void;
}

interface UseWordEditorLoaderParams {
  displayedRecords: ComputedRef<WordRecord[]>;
  wordStore: WordStoreLike;
}

function resolveYamlSource(data: Record<string, unknown>): unknown {
  // v2 API: content JSONB is merged into the response as top-level keys
  // Check if this looks like a v2 merged response (has yield/etymology at top level)
  if (data.yield || data.etymology) {
    return data;
  }
  // Fallback: content field or original_yaml field
  const source = data.content || data.original_yaml;
  if (!source) return null;
  if (typeof source === 'string') return yaml.load(source);
  return source;
}

export const useWordEditorLoader = ({ displayedRecords, wordStore }: UseWordEditorLoaderParams) => {
  const appStore = useAppStore();

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

  /**
   * Load a DB record by lemma into the editor.
   * Uses v2 API: GET /api/v2/words/details?word=<lemma>&language=<lang>
   * One API call instead of the old search-then-fetch-by-id pattern.
   */
  const loadDbRecordByLemma = async (
    lemma: string | undefined,
    language?: string
  ): Promise<boolean> => {
    if (!lemma) return false;
    const lang = language || appStore.currentLanguage || 'en';

    try {
      const res = await request.get('/v2/words/details', {
        params: { word: String(lemma), language: lang },
        skipErrorToast: true,
      });

      if (res?.code === 200 && res?.data) {
        const obj = resolveYamlSource(res.data as Record<string, unknown>);
        if (obj) {
          wordStore.setEditorYaml(formatYamlForEditor(obj));
          const id = (res.data as Record<string, unknown>).id as string | undefined;
          wordStore.setEditingContext({ id: id || null, isLocal: false });
          return true;
        }
      }
    } catch {
      // noop
    }
    return false;
  };

  /**
   * Load a record into the editor by ID.
   * - Local items: parse raw_yaml directly.
   * - DB items: use v2 API GET /api/v2/words/:id, fall back to list cache, then v1 API.
   */
  const loadIntoEditor = async (id: string): Promise<void> => {
    const item = displayedRecords.value.find(r => r.id === id);
    if (!item) {
      wordLogger.warn(`[loadIntoEditor] 未找到 ID 为 ${id} 的词条`);
      return;
    }

    wordLogger.debug(
      `[loadIntoEditor] 开始加载词条: ${item.lemma}, 来源: ${item.isLocal ? '本地' : '数据库'}`
    );

    // --- Local records ---
    if (item.isLocal) {
      try {
        const rawYaml = String(item.raw_yaml || item.content || item.original_yaml || '');
        wordLogger.debug(`[loadIntoEditor] 本地词条 rawYaml 长度: ${rawYaml.length}`);
        const obj = yaml.load(rawYaml);
        wordStore.setEditorYaml(formatYamlForEditor(obj));
        wordLogger.debug(`[loadIntoEditor] 本地词条 YAML 解析成功: ${id}`);
      } catch (e) {
        wordLogger.warn(`[loadIntoEditor] 本地词条 YAML 解析失败，使用原始文本: ${id}`, e);
        const rawYaml = String(item.raw_yaml || item.content || item.original_yaml || '');
        wordStore.setEditorYaml(rawYaml);
      }
      wordStore.setEditingContext({ id, isLocal: true });
      wordLogger.debug(`[loadIntoEditor] 本地词条已加载到编辑器: ${id}`);
      return;
    }

    // --- DB records: try v2 API first ---
    try {
      const full = await request.get(`/v2/words/${encodeURIComponent(id)}`, {
        skipErrorToast: true,
      });
      wordLogger.debug(
        `[loadIntoEditor] v2 API 获取成功: ${full?.lemma}, content keys: ${full?.content ? Object.keys(full.content as object).length : 0}`
      );

      if (full) {
        const obj = resolveYamlSource(full as Record<string, unknown>);
        if (obj) {
          wordStore.setEditorYaml(formatYamlForEditor(obj));
          wordStore.setEditingContext({ id, isLocal: false });
          wordLogger.debug(`[loadIntoEditor] 数据库词条已加载（v2 API）: ${id}`);
          return;
        }
      }
    } catch (e) {
      wordLogger.warn(`[loadIntoEditor] v2 API 获取失败, 尝试缓存: ${id}`, e);
    }

    // --- Fallback: list cache ---
    if (item.content || item.original_yaml) {
      try {
        const source = (item.content || item.original_yaml) as string | Record<string, unknown>;
        const obj = typeof source === 'string' ? yaml.load(source) : source;
        wordStore.setEditorYaml(formatYamlForEditor(obj));
        wordLogger.debug(`[loadIntoEditor] 数据库词条已加载（从缓存）: ${id}`);
      } catch (e) {
        wordLogger.warn(`[loadIntoEditor] 缓存 YAML 解析失败: ${id}`, e);
        const txt =
          typeof (item.content || item.original_yaml) === 'string'
            ? String(item.content || item.original_yaml)
            : yaml.dump(item.content || item.original_yaml, { lineWidth: -1, noRefs: true });
        wordStore.setEditorYaml(txt);
      }
      wordStore.setEditingContext({ id, isLocal: false });
      return;
    }

    // --- Last resort: v1 API ---
    try {
      const full = await request.get(`/words/${encodeURIComponent(id)}`, {
        skipErrorToast: true,
      });
      if (full) {
        const obj = resolveYamlSource(full as Record<string, unknown>);
        if (obj) {
          wordStore.setEditorYaml(formatYamlForEditor(obj));
          wordStore.setEditingContext({ id, isLocal: false });
          wordLogger.debug(`[loadIntoEditor] 数据库词条已加载（v1 回退 API）: ${id}`);
          return;
        }
      }
    } catch (e) {
      wordLogger.error(`[loadIntoEditor] v1 API 也失败了: ${id}`, e);
    }

    wordLogger.error(`[loadIntoEditor] 词条数据为空: ${id}`);
  };

  return {
    formatYamlForEditor,
    loadDbRecordByLemma,
    loadIntoEditor,
  };
};
