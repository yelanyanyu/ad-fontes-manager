import type { ComputedRef } from 'vue';
import request from '@/utils/request';
import yaml from 'js-yaml';
import { wordLogger } from '@/utils/logger';
import { useAppStore } from '@/stores/appStore';
import { stripWordAppMetadata } from '@/utils/wordMetadata';
import type { WordRecord } from '@/types/word-list';

interface WordStoreLike {
  loadEditorSession: (session: {
    yaml: string;
    context: {
      id: string | null;
      isLocal?: boolean;
      wordSchemaVersion?: number | null;
      isLatestSchema?: boolean | null;
    };
  }) => void;
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

function readWordSchemaVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const metadata = (value as Record<string, unknown>).ad_fontes;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const version = (metadata as Record<string, unknown>).word_schema_version;
  return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : null;
}

function buildEditingContext(
  id: string | null,
  isLocal: boolean,
  record: WordRecord,
  source: unknown
) {
  const rowVersion =
    typeof (record as any).word_schema_version === 'number'
      ? ((record as any).word_schema_version as number)
      : null;
  const sourceVersion = readWordSchemaVersion(source);
  const isLatestSchema =
    typeof (record as any).is_latest_schema === 'boolean'
      ? ((record as any).is_latest_schema as boolean)
      : null;

  return {
    id,
    isLocal,
    wordSchemaVersion: rowVersion ?? sourceVersion,
    isLatestSchema,
  };
}

export const useWordEditorLoader = ({ displayedRecords, wordStore }: UseWordEditorLoaderParams) => {
  const appStore = useAppStore();

  const formatYamlForEditor = (yamlObj: unknown): string => {
    const orderedObj: Record<string, unknown> = {};
    const keyOrder = [
      'yield',
      'etymology',
      'word_formation',
      'cognate_family',
      'application',
      'nuance',
    ];
    const visibleYamlObj = stripWordAppMetadata(yamlObj);
    const source =
      visibleYamlObj && typeof visibleYamlObj === 'object'
        ? (visibleYamlObj as Record<string, unknown>)
        : {};

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
          const id = (res.data as Record<string, unknown>).id as string | undefined;
          wordStore.loadEditorSession({
            yaml: formatYamlForEditor(obj),
            context: buildEditingContext(id || null, false, res.data as WordRecord, obj),
          });
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
   * - DB items: use v2 API GET /api/v2/words/:id, then fall back to list cache.
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
        wordStore.loadEditorSession({
          yaml: formatYamlForEditor(obj),
          context: buildEditingContext(id, true, item, obj),
        });
        wordLogger.debug(`[loadIntoEditor] 本地词条 YAML 解析成功: ${id}`);
      } catch (e) {
        wordLogger.warn(`[loadIntoEditor] 本地词条 YAML 解析失败，使用原始文本: ${id}`, e);
        const rawYaml = String(item.raw_yaml || item.content || item.original_yaml || '');
        wordStore.loadEditorSession({
          yaml: rawYaml,
          context: buildEditingContext(id, true, item, null),
        });
      }
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
          wordStore.loadEditorSession({
            yaml: formatYamlForEditor(obj),
            context: buildEditingContext(id, false, item, obj),
          });
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
        wordStore.loadEditorSession({
          yaml: formatYamlForEditor(obj),
          context: buildEditingContext(id, false, item, obj),
        });
        wordLogger.debug(`[loadIntoEditor] 数据库词条已加载（从缓存）: ${id}`);
      } catch (e) {
        wordLogger.warn(`[loadIntoEditor] 缓存 YAML 解析失败: ${id}`, e);
        const txt =
          typeof (item.content || item.original_yaml) === 'string'
            ? String(item.content || item.original_yaml)
            : yaml.dump(item.content || item.original_yaml, { lineWidth: -1, noRefs: true });
        wordStore.loadEditorSession({
          yaml: txt,
          context: buildEditingContext(id, false, item, null),
        });
      }
      return;
    }

    wordLogger.error(`[loadIntoEditor] 词条数据为空: ${id}`);
  };

  return {
    formatYamlForEditor,
    loadDbRecordByLemma,
    loadIntoEditor,
  };
};
