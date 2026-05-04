<script setup lang="ts">
/**
 * @file WordPreview.vue
 * @description 词条预览组件，提供卡片预览、Markdown 预览、图片导出功能
 *
 * @component WordPreview
 * @example
 * <WordPreview :wordId="wordId" @close="handleClose" />
 *
 * @features
 * - 卡片预览模式：以精美卡片形式展示词条信息
 * - Markdown 预览模式：以 Markdown 格式展示词条内容
 * - 图片导出功能：支持将卡片导出为 PNG 图片
 * - 剪贴板操作：支持复制 HTML 代码、图片到剪贴板
 *
 * @dependencies
 * - vue: Vue 3 Composition API
 * - marked: Markdown 解析器
 * - html-to-image: 将 HTML 元素转换为图片
 * - js-yaml: YAML 数据解析
 * - @/stores/wordStore: 词条数据状态管理
 * - @/stores/appStore: 应用状态管理（Toast 提示）
 * - @/utils/generator: 卡片 HTML 和 Markdown 生成器
 * - @/utils/template: 模板渲染工具
 * - @/utils/request: HTTP 请求工具
 */

import { ref, onMounted, watch } from 'vue';
import { marked } from 'marked';
import { toPng, toBlob } from 'html-to-image';
import { useWordStore } from '@/stores/wordStore';
import { useAppStore } from '@/stores/appStore';
import { generateCardHTML, generateMarkdown } from '@/utils/generator';
import { renderTemplate } from '@/utils/template';
import request from '@/utils/request';
import yaml from 'js-yaml';
import type { PreviewMode, PreviewRecord, PreviewYamlData } from '@/types/word-preview';

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
 * 预览模式
 * @type {import('vue').Ref<'card' | 'markdown'>}
 * @description 当前预览模式，可选值：
 * - 'card': 卡片预览模式，展示精美卡片
 * - 'markdown': Markdown 预览模式，展示 Markdown 格式内容
 */
const mode = ref<PreviewMode>('card');

/**
 * 渲染后的内容
 * @type {import('vue').Ref<string>}
 * @description 根据当前模式渲染的 HTML 或 Markdown 内容
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

/**
 * 规范化 YAML 数据
 * @param {string | Object | null} maybeYaml - 可能是 YAML 字符串或已解析的对象
 * @returns {Object | null} 解析后的数据对象，解析失败返回 null
 * @description 将 YAML 字符串解析为 JavaScript 对象，或返回已解析的对象
 */
const normalizeYamlData = (
  maybeYaml: string | PreviewYamlData | null | undefined
): PreviewYamlData | null => {
  if (!maybeYaml) return null;
  if (typeof maybeYaml === 'string') {
    try {
      const parsed = yaml.load(maybeYaml);
      return parsed && typeof parsed === 'object' ? (parsed as PreviewYamlData) : null;
    } catch {
      return null;
    }
  }
  if (typeof maybeYaml === 'object') return maybeYaml;
  return null;
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

    rawData.value = normalizeYamlData(data);
    renderContent();
  } catch {
    appStore.addToast('Failed to load word details', 'error');
  } finally {
    loading.value = false;
  }
};

/**
 * 渲染内容
 * @description
 * 根据当前预览模式（mode）渲染对应的内容：
 * - card 模式：使用自定义模板或默认模板生成卡片 HTML
 * - markdown 模式：生成 Markdown 并解析为 HTML
 */
const renderContent = (): void => {
  if (!rawData.value) return;

  if (mode.value === 'card') {
    const templateMode = localStorage.getItem('etymos.wordCardTemplateMode') || 'default';
    const customTemplate = localStorage.getItem('etymos.wordCardTemplateHtml') || '';

    if (templateMode === 'custom' && customTemplate.trim()) {
      content.value = renderTemplate(customTemplate, rawData.value);
    } else {
      content.value = generateCardHTML(rawData.value);
    }
  } else {
    const md = generateMarkdown(rawData.value);
    const parsed = marked.parse(md);
    content.value = typeof parsed === 'string' ? parsed : '';
  }
};

watch(() => props.wordId, loadWord);
watch(mode, renderContent);

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

const copyContent = async (type: 'html' | 'md'): Promise<void> => {
  if (!rawData.value) return;
  let text = '';
  if (type === 'html') {
    // Re-generate to ensure it matches current view
    text = mode.value === 'card' ? content.value : generateCardHTML(rawData.value);
  } else if (type === 'md') {
    text = generateMarkdown(rawData.value);
  }

  try {
    await navigator.clipboard.writeText(text);
    appStore.addToast('Copied to clipboard', 'success');
  } catch {
    appStore.addToast('Copy failed', 'error');
  }
};

const copyRichText = (): void => {
  if (!rawData.value) return;
  const html = mode.value === 'markdown' ? content.value : generateCardHTML(rawData.value);
  const item = new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) });
  navigator.clipboard.write([item]).then(
    () => appStore.addToast('Rich text copied', 'success'),
    () => appStore.addToast('Copy failed', 'error')
  );
};
</script>

<template>
  <div class="preview-container">
    <!-- Preview Header -->
    <div class="preview-header">
      <button
        class="text-stone-500 hover:text-slate-800 flex items-center gap-2 font-bold text-sm transition-colors group"
        @click="close"
      >
        <div
          class="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center group-hover:bg-emerald-100 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </div>
        <span>Back to List</span>
      </button>

      <!-- View Toggle -->
      <div class="flex bg-stone-100 p-1 rounded-lg">
        <button
          :class="[
            mode === 'card'
              ? 'bg-white text-slate-700 shadow-sm'
              : 'text-slate-500 hover:bg-emerald-100/50',
          ]"
          class="px-4 py-1.5 text-xs rounded-md font-bold transition-colors"
          @click="mode = 'card'"
        >
          Card
        </button>
        <button
          :class="[
            mode === 'markdown'
              ? 'bg-white text-slate-700 shadow-sm'
              : 'text-slate-500 hover:bg-emerald-100/50',
          ]"
          class="px-4 py-1.5 text-xs rounded-md font-medium transition-colors"
          @click="mode = 'markdown'"
        >
          Markdown
        </button>
      </div>
    </div>

    <div class="p-8 w-full max-w-5xl mx-auto flex-1">
      <!-- Dynamic Content -->
      <div v-if="loading" class="text-center py-10 flex flex-col items-center gap-2 text-slate-500">
        <svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="31.4 31.4" /></svg>
        <span>Loading...</span>
      </div>

      <div v-else-if="mode === 'card'" class="flex flex-col items-center gap-6">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div ref="cardRef" v-html="content" class="w-full" />
        <div class="flex flex-wrap items-center justify-center gap-3">
          <button
            class="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-full font-bold shadow-lg transition transform active:scale-95 flex items-center gap-2"
            @click="copyContent('html')"
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

      <div v-else class="flex flex-col gap-8 w-full max-w-4xl mx-auto">
        <div class="preview-card">
          <div class="preview-card-header">
            <h3 class="font-bold text-sm text-gray-700 uppercase tracking-wide">
              <svg class="inline mr-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>Preview
            </h3>
            <button
              class="text-xs bg-white text-blue-600 border border-blue-200 px-3 py-1 rounded shadow-sm"
              @click="copyRichText"
            >
              Copy Rich Text
            </button>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div id="md-render-target" class="p-8 markdown-body" v-html="content" />
        </div>
        <div class="source-panel">
          <div class="source-header">
            <h3>
              <svg class="inline mr-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></svg>Source
            </h3>
            <button class="btn btn-sm" @click="copyContent('md')">
              Copy Source
            </button>
          </div>
          <div class="source-body">
            <pre>{{ generateMarkdown(rawData || {}) }}</pre>
          </div>
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

.preview-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.preview-card-header {
  background: var(--surface-soft);
  border-bottom: 1px solid var(--line);
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-card-header h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.source-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

[data-theme="dark"] .source-panel {
  background: var(--nav-soft);
  border-color: var(--border);
}

.source-header {
  background: var(--surface-soft);
  border-bottom: 1px solid var(--line);
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

[data-theme="dark"] .source-header {
  background: var(--nav);
}

.source-header h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--green);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.source-body {
  padding: 16px;
  overflow-x: auto;
}

.source-body pre {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text);
  white-space: pre-wrap;
  margin: 0;
}

.btn {
  font-size: 12px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-soft);
  cursor: pointer;
  font-weight: 560;
  transition: background 0.12s ease;
}

.btn:hover {
  background: var(--surface-soft);
}
</style>
