/** * @file ConflictModal.vue * @description 冲突对比弹窗组件，用于显示数据冲突并提供解决方案 * *
@component ConflictModal * * @usage *
该组件用于在数据同步、导入或更新时检测到冲突时，向用户展示冲突详情并提供解决选项。 *
典型使用场景包括： * - 文件导入时发现与现有数据冲突 * - 多用户协作编辑时的版本冲突 * -
数据同步时的合并冲突 * * @dependencies * - vue: Vue 3 Composition API * - @/utils/conflict:
冲突处理工具函数（deepDiffAdapter, yamlFormatter） */

<script setup>
import { computed } from 'vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';

/**
 * 组件 Props 定义
 * @typedef {Object} ConflictModalProps
 */
const props = defineProps({
  /** 是否显示弹窗 */
  open: { type: Boolean, default: false },

  /** 弹窗标题 */
  title: { type: String, default: 'Conflict Detected' },

  /** 副标题，用于显示额外的冲突描述信息 */
  subtitle: { type: String, default: '' },

  /**
   * 差异数据，由 diffAdapter 解析生成
   * @type {Array}
   */
  diff: { type: Array, default: null },

  /** 左侧面板标签，通常表示"现有数据" */
  leftLabel: { type: String, default: 'Existing' },

  /** 右侧面板标签，通常表示"新数据" */
  rightLabel: { type: String, default: 'New' },

  /**
   * 左侧面板数据（现有数据）
   * @type {Object | String}
   */
  leftData: { type: [Object, String], default: null },

  /**
   * 右侧面板数据（新数据）
   * @type {Object | String}
   */
  rightData: { type: [Object, String], default: null },

  /**
   * 数据格式化器，用于将数据转换为可读的字符串格式
   * @default yamlFormatter
   */
  formatter: { type: Object, default: () => yamlFormatter },

  /**
   * 差异适配器，用于解析 diff 数据并提取模块和徽章信息
   * @default deepDiffAdapter
   */
  diffAdapter: { type: Object, default: () => deepDiffAdapter },

  /** 主操作按钮标签（覆盖操作） */
  primaryLabel: { type: String, default: 'Overwrite' },

  /** 次操作按钮标签（使用现有数据） */
  secondaryLabel: { type: String, default: 'Use Existing' },

  /** 第三操作按钮标签（编辑本地数据），为空时不显示该按钮 */
  tertiaryLabel: { type: String, default: '' },

  /** 是否正在处理冲突操作 */
  busy: { type: Boolean, default: false },
});

/**
 * 组件事件定义
 * @emits close - 关闭弹窗事件
 * @emits primary - 主操作事件，通常表示"使用新数据覆盖"
 * @emits secondary - 次操作事件，通常表示"保留现有数据"
 * @emits tertiary - 第三操作事件，通常表示"编辑本地数据"
 */
const emit = defineEmits(['close', 'primary', 'secondary', 'tertiary']);

/**
 * 从 diff 数据中提取的模块列表
 * @returns {Array<string>} 模块名称数组
 */
const modules = computed(() => props.diffAdapter?.getModules?.(props.diff) || []);

/**
 * 从 diff 数据中提取的变更徽章列表
 * @returns {Array<{path: string, cls: string}>} 徽章对象数组，包含路径和样式类
 */
const badges = computed(() => props.diffAdapter?.getBadges?.(props.diff) || []);

/**
 * 格式化数据为可读的字符串格式
 * @param {Object | String} val - 要格式化的数据
 * @returns {string} 格式化后的字符串
 */
const format = val => {
  if (!val) return props.formatter.format({});
  if (typeof val === 'string') return val;
  return props.formatter.format(val);
};

const badgeToneClass = cls => {
  if (cls.includes('green')) return 'tone-new';
  if (cls.includes('red')) return 'tone-deleted';
  if (cls.includes('yellow')) return 'tone-edited';
  if (cls.includes('indigo')) return 'tone-array';
  return 'tone-neutral';
};
</script>

<template>
  <div
    v-if="open"
    class="conflict-backdrop fixed inset-0 z-40 flex items-center justify-center overflow-hidden p-3 sm:p-4"
    role="dialog"
    aria-modal="true"
  >
    <div class="conflict-modal flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl shadow-lg">
      <div class="conflict-header flex shrink-0 items-center justify-between gap-3 px-4 py-3 font-bold">
        <span class="min-w-0 truncate">{{ title }}</span>
        <button
          class="conflict-close shrink-0 transition-colors"
          aria-label="Close"
          @click="$emit('close')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div v-if="subtitle" class="conflict-subtitle shrink-0 px-4 py-2 text-sm">
        {{ subtitle }}
      </div>

      <div
        v-if="modules.length || badges.length"
        class="conflict-meta max-h-[22vh] shrink-0 overflow-auto px-4 py-3 text-sm"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="conflict-meta-label font-bold">Modules:</span>
          <span
            v-for="m in modules"
            :key="m"
            class="conflict-module px-2 py-0.5 rounded border text-xs font-bold"
            >{{ m }}</span
          >
          <span v-if="!modules.length" class="conflict-empty text-xs">No module detail</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="b in badges"
            :key="b.path"
            class="conflict-badge px-2 py-0.5 rounded border text-[10px] font-bold"
            :class="badgeToneClass(b.cls)"
            >{{ b.path }}</span
          >
        </div>
      </div>

      <div class="conflict-body grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
        <div class="conflict-pane min-h-0 border-b md:border-b-0 md:border-r">
          <div class="conflict-pane-head shrink-0 px-4 py-2 text-xs font-bold">
            {{ leftLabel }}
          </div>
          <pre class="conflict-code min-h-0 flex-1 overflow-auto p-4 text-xs">{{ format(leftData) }}</pre>
        </div>
        <div class="conflict-pane min-h-0">
          <div class="conflict-pane-head shrink-0 px-4 py-2 text-xs font-bold">
            {{ rightLabel }}
          </div>
          <pre class="conflict-code min-h-0 flex-1 overflow-auto p-4 text-xs">{{ format(rightData) }}</pre>
        </div>
      </div>

      <div class="conflict-actions flex shrink-0 flex-wrap justify-end gap-2 px-4 py-3">
        <button
          v-if="tertiaryLabel"
          class="conflict-secondary px-3 py-1.5 rounded-lg border text-sm transition-colors"
          :disabled="busy"
          @click="$emit('tertiary')"
        >
          {{ tertiaryLabel }}
        </button>
        <button
          class="conflict-secondary px-3 py-1.5 rounded-lg border text-sm transition-colors"
          :disabled="busy"
          @click="$emit('secondary')"
        >
          {{ secondaryLabel }}
        </button>
        <button
          class="conflict-primary px-3 py-1.5 rounded-lg text-sm transition-colors"
          :disabled="busy"
          @click="$emit('primary')"
        >
          {{ primaryLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conflict-backdrop {
  background: rgba(0, 0, 0, 0.44);
}

.conflict-modal {
  background: var(--surface-panel);
  border: 1px solid var(--border-strong);
  color: var(--text);
  box-shadow: var(--shadow-md);
}

.conflict-header,
.conflict-subtitle,
.conflict-meta,
.conflict-pane-head,
.conflict-actions {
  border-color: var(--line);
}

.conflict-header {
  border-bottom: 1px solid var(--line);
  color: var(--text);
}

.conflict-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: var(--faint);
}

.conflict-close:hover {
  color: var(--green);
}

.conflict-subtitle,
.conflict-meta {
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.conflict-meta-label {
  color: var(--text-soft);
}

.conflict-module {
  background: var(--surface-soft);
  border-color: var(--green-border);
  color: var(--text-soft);
}

.conflict-empty {
  color: var(--faint);
}

.conflict-badge {
  color: var(--text-soft);
}

.conflict-badge.tone-new {
  background: var(--green-soft);
  border-color: var(--green-border);
  color: var(--green);
}

.conflict-badge.tone-deleted {
  background: var(--red-soft);
  border-color: var(--red-border);
  color: var(--red);
}

.conflict-badge.tone-edited {
  background: var(--amber-soft);
  border-color: var(--amber-border);
  color: var(--amber);
}

.conflict-badge.tone-array {
  background: var(--blue-soft);
  border-color: var(--blue-border);
  color: var(--blue);
}

.conflict-badge.tone-neutral {
  background: var(--surface-soft);
  border-color: var(--line);
  color: var(--muted);
}

.conflict-pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-color: var(--line);
}

.conflict-pane-head {
  background: var(--surface-head);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.conflict-code {
  min-width: 0;
  background: var(--editor-field);
  color: var(--text-soft);
}

.conflict-actions {
  background: var(--surface-head);
  border-top: 1px solid var(--line);
}

.conflict-secondary {
  background: var(--surface);
  border-color: var(--green-border);
  color: var(--text-soft);
}

.conflict-secondary:hover {
  background: var(--green-soft);
  color: var(--green);
}

.conflict-primary {
  background: #be334b;
  color: #fff;
}

.conflict-primary:hover {
  background: #d13f58;
}

.conflict-secondary:disabled,
.conflict-primary:disabled {
  cursor: wait;
  opacity: 0.64;
}
</style>
