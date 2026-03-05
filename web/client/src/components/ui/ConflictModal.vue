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
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="w-full max-w-5xl rounded-xl bg-white shadow-lg border border-slate-200 overflow-hidden"
    >
      <div
        class="px-4 py-3 border-b border-slate-100 font-bold text-slate-800 flex items-center justify-between"
      >
        <span>{{ title }}</span>
        <button
          class="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
          @click="$emit('close')"
        >
          <i class="fa-solid fa-xmark text-xl" />
        </button>
      </div>

      <div v-if="subtitle" class="px-4 py-2 text-sm text-slate-600 border-b border-slate-100">
        {{ subtitle }}
      </div>

      <div
        v-if="modules.length || badges.length"
        class="px-4 py-3 text-sm text-slate-600 border-b border-slate-100"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-bold text-slate-700">Modules:</span>
          <span
            v-for="m in modules"
            :key="m"
            class="px-2 py-0.5 rounded border bg-slate-50 text-slate-700 border-slate-200 text-xs font-bold"
            >{{ m }}</span
          >
          <span v-if="!modules.length" class="text-slate-400 text-xs">No module detail</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="b in badges"
            :key="b.path"
            class="px-2 py-0.5 rounded border text-[10px] font-bold"
            :class="b.cls"
            >{{ b.path }}</span
          >
        </div>
      </div>

      <div class="grid grid-cols-2 gap-0">
        <div class="border-r border-slate-100">
          <div
            class="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-50 border-b border-slate-100"
          >
            {{ leftLabel }}
          </div>
          <pre class="p-4 text-xs overflow-auto max-h-[50vh]">{{ format(leftData) }}</pre>
        </div>
        <div>
          <div
            class="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-50 border-b border-slate-100"
          >
            {{ rightLabel }}
          </div>
          <pre class="p-4 text-xs overflow-auto max-h-[50vh]">{{ format(rightData) }}</pre>
        </div>
      </div>

      <div class="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
        <button
          v-if="tertiaryLabel"
          class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors"
          @click="$emit('tertiary')"
        >
          {{ tertiaryLabel }}
        </button>
        <button
          class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 transition-colors"
          @click="$emit('secondary')"
        >
          {{ secondaryLabel }}
        </button>
        <button
          class="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
          @click="$emit('primary')"
        >
          {{ primaryLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
