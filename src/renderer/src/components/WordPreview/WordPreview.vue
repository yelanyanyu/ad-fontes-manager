<script setup lang="ts">
/**
 * @file WordPreview.vue
 * @description 词条预览组件，提供卡片预览、图片导出功能
 *
 * @component WordPreview
 * @example
 * <WordPreview :wordId="wordId" @close="handleClose" />
 *
 * @features
 * - 卡片预览模式：以精美卡片形式展示词条信息
 * - 图片导出功能：支持将卡片导出为 PNG 图片
 * - 剪贴板操作：支持复制 HTML 代码、图片到剪贴板
 *
 * @dependencies
 * - vue: Vue 3 Composition API
 * - html-to-image: 将 HTML 元素转换为图片
 * - @/stores/wordStore: 词条数据状态管理
 * - @/stores/appStore: 应用状态管理（Toast 提示）
 * - @/modules/previewContent: 预览内容转换
 * - @/utils/request: HTTP 请求工具
 */

import { ref, onMounted, watch } from 'vue';
import { toPng, toBlob } from 'html-to-image';
import { useWordStore } from '@/stores/wordStore';
import { useAppStore } from '@/stores/appStore';
import { buildPreviewContent, type PreviewSchemaFreshness } from '@/modules/previewContent';
import request from '@/utils/request';
import type { PreviewRecord, PreviewYamlData } from '@/types/word-preview';

/**
 * 组件 Props 定义
 * @property {string} wordId - 要预览的词条 ID
 */
const props = defineProps<{
  wordId?: string | null;
}>();

/**
 * 组件事件定义
 * @emits close - 关闭预览事件
 */
const emit = defineEmits<{
  (e: 'close'): void;
}>();

interface WordStoreLike {
  localRecords: PreviewRecord[];
  dbRecords: PreviewRecord[];
}

interface AppStoreLike {
  addToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
}

const wordStore = useWordStore() as unknown as WordStoreLike;
const appStore = useAppStore() as unknown as AppStoreLike;

/**
 * 渲染后的内容
 * @type {import('vue').Ref<string>}
 * @description 渲染后的 HTML 内容
 */
const content = ref<string>('');

/**
 * 加载状态
 * @type {import('vue').Ref<boolean>}
 * @description 是否正在加载词条数据
 */
const loading = ref<boolean>(false);

/**
 * 原始词条数据
 * @type {import('vue').Ref<Object | null>}
 * @description 从 YAML 解析后的原始词条数据对象
 */
const rawData = ref<PreviewYamlData | null>(null);
const schemaFreshness = ref<PreviewSchemaFreshness | null>(null);
const previewError = ref<string>('');

/**
 * 规范化 YAML 数据
 * @param {string | Object | null} maybeYaml - 可能是 YAML 字符串或已解析的对象
 * @returns {Object | null} 解析后的数据对象，解析失败返回 null
 * @description 将 YAML 字符串解析为 JavaScript 对象，或返回已解析的对象
 */
const setPreviewContent = (data: string | PreviewYamlData | null | undefined): void => {
  const preview = buildPreviewContent(data);
  rawData.value = preview.rawData;
  content.value = preview.html;
  schemaFreshness.value = preview.schemaFreshness;
  previewError.value = preview.error || '';
};

/**
 * 加载词条数据
 * @async
 * @returns {Promise<void>}
 * @description
 * 根据 wordId 加载词条数据，优先从本地存储或数据库缓存中查找，
 * 如果数据不完整（缺少 YAML），则从服务器获取完整数据。
 * 加载完成后调用 renderContent 渲染内容。
 *
 * @throws {Error} 加载失败时会显示错误提示
 */
const loadWord = async (): Promise<void> => {
  if (!props.wordId) return;
  loading.value = true;
  try {
    const record = (wordStore.dbRecords || []).find(
      r => r.id === props.wordId
    );

    if (!record) {
      appStore.addToast('Record not found', 'error');
      loading.value = false;
      return;
    }

    let data: string | PreviewYamlData | undefined = record.content || record.original_yaml || record.raw_yaml;

    // Fetch full data if missing yaml (e.g. from DB list which might be partial)
    if (!data && !record.isLocal) {
      const full = await request.get(`/v2/words/${encodeURIComponent(props.wordId)}`, {
        skipErrorToast: true,
      });
      data = full.content || full.original_yaml;
      record.content = full.content;
      record.original_yaml = full.original_yaml;
    }

    setPreviewContent(data);
  } catch {
    appStore.addToast('Failed to load word details', 'error');
  } finally {
    loading.value = false;
  }
};

watch(() => props.wordId, loadWord);

onMounted(() => {
  if (props.wordId) void loadWord();
});

const close = (): void => emit('close');

/**
 * 卡片 DOM 引用
 * @type {import('vue').Ref<HTMLElement | null>}
 * @description 用于图片生成的卡片元素引用
 */
const cardRef = ref<HTMLElement | null>(null);

/**
 * 图片生成状态
 * @type {import('vue').Ref<boolean>}
 * @description 是否正在生成图片
 */
const generatingImage = ref<boolean>(false);

/**
 * 生成卡片图片
 * @async
 * @returns {Promise<string | null>} 图片的 Data URL，生成失败返回 null
 * @description
 * 将卡片元素转换为 PNG 图片，使用 html-to-image 库的 toPng 方法。
 * 图片分辨率为 2x，背景色为 #fcfbf9。
 *
 * @throws {Error} 生成失败时会显示错误提示
 */
const generateCardImage = async (): Promise<string | null> => {
  if (!cardRef.value) return null;
  generatingImage.value = true;
  try {
    const dataUrl = await toPng(cardRef.value, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#fcfbf9',
    });
    return dataUrl;
  } catch {
    appStore.addToast('Failed to generate image', 'error');
    return null;
  } finally {
    generatingImage.value = false;
  }
};

/**
 * 复制图片到剪贴板
 * @async
 * @returns {Promise<void>}
 * @description
 * 将卡片元素转换为 PNG 图片并复制到系统剪贴板。
 * 成功后会显示成功提示，失败显示错误提示。
 *
 * @requires navigator.clipboard.write - 需要 Clipboard API 支持
 * @throws {Error} 复制失败时会显示错误提示
 */
const copyImageToClipboard = async (): Promise<void> => {
  if (!cardRef.value) return;
  generatingImage.value = true;
  try {
    const blob = await toBlob(cardRef.value, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#fcfbf9',
    });
    if (blob) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      appStore.addToast('Image copied to clipboard', 'success');
    }
  } catch {
    appStore.addToast('Failed to copy image', 'error');
  } finally {
    generatingImage.value = false;
  }
};

/**
 * 下载卡片图片
 * @async
 * @returns {Promise<void>}
 * @description
 * 生成卡片图片并触发浏览器下载。
 * 文件名使用词条的 lemma 字段，默认为 'word-card.png'。
 *
 * @throws {Error} 生成失败时会显示错误提示
 */
const downloadCardImage = async (): Promise<void> => {
  const dataUrl = await generateCardImage();
  if (dataUrl) {
    const link = document.createElement('a');
    const wordName = rawData.value?.yield?.lemma || 'word-card';
    link.download = `${wordName}.png`;
    link.href = dataUrl;
    link.click();
    appStore.addToast('Image downloaded', 'success');
  }
};

const copyHtml = async (): Promise<void> => {
  if (!rawData.value) return;
  const text = content.value;

  try {
    await navigator.clipboard.writeText(text);
    appStore.addToast('Copied to clipboard', 'success');
  } catch {
    appStore.addToast('Copy failed', 'error');
  }
};

const schemaNoticeText = (): string => {
  if (schemaFreshness.value === 'old') return '旧 - 可预览，建议重新生成';
  if (schemaFreshness.value === 'future') return '新版 - 当前应用可能无法完整显示';
  return '';
};

</script>

<template>
  <div class="preview-container">
    <!-- Preview Header -->
    <div class="preview-header">
      <button
        type="button"
        class="text-stone-500 hover:text-slate-800 flex items-center gap-2 font-bold text-sm transition-colors group"
        @click.stop.prevent="close"
      >
        <div
          class="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center group-hover:bg-emerald-100 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </div>
        <span>Back to List</span>
      </button>
    </div>

    <div class="p-8 w-full max-w-5xl mx-auto flex-1">
      <!-- Dynamic Content -->
      <div v-if="loading" class="text-center py-10 flex flex-col items-center gap-2 text-slate-500">
        <svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4 31.4" /></svg>
        <span>Loading...</span>
      </div>

      <div v-else class="flex flex-col items-center gap-6">
        <div v-if="schemaNoticeText()" class="schema-notice">
          {{ schemaNoticeText() }}
        </div>
        <div v-if="previewError" class="schema-notice schema-notice--error">
          {{ previewError }}
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div ref="cardRef" v-html="content" class="w-full" />
        <div class="flex flex-wrap items-center justify-center gap-3">
          <button
            class="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-full font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2"
            @click="copyHtml"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> <span>Copy HTML Code (Anki)</span>
          </button>
          <button
            :disabled="generatingImage"
            class="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white px-6 py-2 rounded-full font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2"
            @click="copyImageToClipboard"
          >
            <svg :class="{ 'animate-spin': generatingImage }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
            <span>{{ generatingImage ? 'Generating...' : 'Copy as Image' }}</span>
          </button>
          <button
            :disabled="generatingImage"
            class="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-400 text-white px-6 py-2 rounded-full font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2"
            @click="downloadCardImage"
          >
            <svg :class="{ 'animate-spin': generatingImage }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>
            <span>{{ generatingImage ? 'Generating...' : 'Download Image' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-container {
  position: absolute;
  inset: 0;
  background: var(--bg-bottom);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  z-index: 30;
}

.preview-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(255, 255, 252, 0.76);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--border);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

[data-theme="dark"] .preview-header {
  background: rgba(24, 22, 20, 0.76);
}

.schema-notice {
  align-self: stretch;
  max-width: 980px;
  margin: 0 auto;
  border: 1px solid rgba(176, 103, 25, 0.3);
  border-radius: var(--radius-md);
  background: rgba(176, 103, 25, 0.1);
  color: #7c4713;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 650;
}

.schema-notice--error {
  border-color: rgba(188, 72, 72, 0.34);
  background: rgba(188, 72, 72, 0.1);
  color: #9f2f2f;
}

</style>
