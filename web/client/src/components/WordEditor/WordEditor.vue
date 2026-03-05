<script setup>
/**
 * @file WordEditor.vue
 * @description 词条编辑组件，提供 YAML 编辑、验证、保存和冲突处理功能
 *
 * @component WordEditor
 * @category Components
 * @subcategory WordEditor
 *
 * @features
 * - YAML 文本编辑与实时验证
 * - 词条保存（支持本地和数据库两种模式）
 * - 冲突检测与处理（使用现有数据或覆盖）
 * - 连接状态感知（根据连接状态自动选择保存目标）
 *
 * @dependencies
 * - vue: Vue 3 Composition API
 * - js-yaml: YAML 解析与格式化
 * - pinia: 状态管理
 * - @/stores/wordStore: 词条状态管理
 * - @/stores/appStore: 应用状态管理（Toast 通知）
 * - @/components/ui/ConflictModal.vue: 冲突弹窗组件
 * - @/utils/conflict: 冲突处理工具（diff 适配器、YAML 格式化器）
 */

import { ref, watch, computed } from 'vue';
import yaml from 'js-yaml';
import { useWordStore } from '@/stores/wordStore';
import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';
import ConflictModal from '@/components/ui/ConflictModal.vue';
import { deepDiffAdapter, yamlFormatter } from '@/utils/conflict';

/** @type {import('@/stores/wordStore').WordStore} 词条状态管理 store */
const wordStore = useWordStore();

/** @type {import('@/stores/appStore').AppStore} 应用状态管理 store */
const appStore = useAppStore();

/**
 * @description 从 wordStore 解构的响应式引用
 * @property {Ref<string>} editorYaml - 编辑器中的 YAML 内容
 * @property {Ref<string>} connectionStatus - 连接状态（'connected' | 'disconnected'）
 * @property {Ref<boolean>} currentEditingIsLocal - 当前编辑的是否为本地词条
 */
const { editorYaml, connectionStatus, currentEditingIsLocal } = storeToRefs(wordStore);

/**
 * @description 编辑器中的 YAML 文本内容
 * @type {Ref<string>}
 * @default ''
 */
const input = ref('');

/**
 * @description YAML 验证状态
 * @type {Ref<string>}
 * @default ''
 * @value 'Valid YAML' - YAML 格式有效
 * @value 'Invalid YAML' - YAML 格式无效
 */
const status = ref('');

/**
 * @description 冲突数据，用于显示冲突弹窗
 * @type {Ref<Object|null>}
 * @property {string} status - 冲突状态，值为 'conflict' 时表示冲突
 * @property {Object} oldData - 服务器/本地现有的数据
 * @property {Object} newData - 用户尝试保存的新数据
 * @property {Array} diff - 数据差异列表
 * @property {string} source - 冲突来源（'local' | 'db'）
 * @property {string} id - 冲突词条的 ID
 * @default null
 */
const conflictData = ref(null);

/**
 * @description 保存按钮标签计算属性
 * 根据当前编辑状态和连接状态动态生成保存按钮的显示文本
 * @computed
 * @returns {string} 保存按钮标签
 * @returns {'Save Locally (Offline)'} 当编辑本地词条或连接断开时
 * @returns {'Save to Database'} 当连接正常且编辑非本地词条时
 */
const saveLabel = computed(() => {
  // 根据编辑状态和连接状态决定保存标签
  if (currentEditingIsLocal.value) return 'Save Locally (Offline)';
  if (connectionStatus.value === 'connected') return 'Save to Database';
  return 'Save Locally (Offline)';
});

/**
 * @description 判断输入是否为空
 * 检查 textarea 内容是否为空或仅包含空白字符
 * @computed
 * @returns {boolean} 为空时返回 true，否则返回 false
 */
const isEmpty = computed(() => {
  return !input.value || input.value.trim().length === 0;
});

/**
 * @description 处理编辑器输入并验证 YAML 格式
 * 实时验证用户输入的 YAML 文本，更新验证状态
 * 验证规则：
 * 1. 必须是有效的 YAML 语法
 * 2. 解析结果必须是对象类型（非字符串、数字、数组等）
 * 3. 解析结果必须包含 yield 字段
 * @function handleInput
 * @returns {void}
 */
const handleInput = () => {
  // 空输入时清空状态
  if (!input.value || input.value.trim().length === 0) {
    status.value = '';
    return;
  }
  try {
    const result = yaml.load(input.value);
    // 检查是否为对象类型（非 null、非数组、包含 yield 字段）
    if (
      result &&
      typeof result === 'object' &&
      !Array.isArray(result) &&
      result.yield !== undefined
    ) {
      status.value = 'Valid YAML';
    } else {
      status.value = 'Invalid YAML';
    }
  } catch (e) {
    status.value = 'Invalid YAML';
  }
};

/**
 * @description 监听 editorYaml 变化，同步到编辑器
 * 当外部更新 editorYaml 时，自动同步到 input 并触发验证
 */
watch(
  editorYaml,
  val => {
    if (typeof val === 'string') {
      input.value = val;
      handleInput();
    }
  },
  { immediate: true }
);

/**
 * @description 清空编辑器内容
 * @function clear
 * @returns {void}
 */
const clear = () => {
  input.value = '';
  status.value = '';
};

/**
 * @description 保存词条
 * 验证 YAML 格式后调用 store 保存，处理可能的冲突情况
 * @async
 * @function save
 * @returns {Promise<void>}
 * @emits appStore.addToast - 当 YAML 格式无效时发送错误提示
 */
const save = async () => {
  if (!input.value) return;
  // 保存前再次验证 YAML
  if (status.value === 'Invalid YAML') {
    appStore.addToast('Cannot save: Invalid YAML format', 'error');
    return;
  }
  const res = await wordStore.saveWord(input.value);
  if (res && res.status === 'conflict') {
    conflictData.value = res;
  }
};

/**
 * @description 关闭冲突弹窗
 * @function closeConflict
 * @returns {void}
 */
const closeConflict = () => {
  conflictData.value = null;
};

/**
 * @description 冲突处理：使用现有数据
 * 当检测到冲突时，选择放弃当前编辑内容，使用服务器/本地现有的数据
 * @function useExisting
 * @returns {void}
 */
const useExisting = () => {
  if (!conflictData.value || !conflictData.value.oldData) return;
  try {
    input.value = yamlFormatter.format(conflictData.value.oldData);
  } catch (e) {
    input.value = yaml.dump(conflictData.value.oldData || {}, { lineWidth: -1, noRefs: true });
  }
  if (conflictData.value.source === 'local' && conflictData.value.id) {
    wordStore.setEditingContext({ id: conflictData.value.id, isLocal: true });
  }
  handleInput();
  closeConflict();
};

/**
 * @description 冲突处理：覆盖现有数据
 * 当检测到冲突时，选择强制使用当前编辑内容覆盖服务器/本地现有的数据
 * @async
 * @function overwrite
 * @returns {Promise<void>}
 */
const overwrite = async () => {
  const target =
    conflictData.value?.source === 'local'
      ? 'local'
      : conflictData.value?.source === 'db'
        ? 'db'
        : 'auto';
  const ok = await wordStore.saveWord(input.value, true, target);
  if (ok) closeConflict();
};
</script>

<template>
  <div
    class="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col min-h-0 overflow-hidden relative"
  >
    <ConflictModal
      :open="!!conflictData"
      title="Conflict Detected"
      :diff="conflictData?.diff || []"
      :left-data="conflictData?.oldData || {}"
      :right-data="conflictData?.newData || {}"
      left-label="Existing"
      right-label="New"
      primary-label="Overwrite"
      secondary-label="Use Existing"
      :formatter="yamlFormatter"
      :diff-adapter="deepDiffAdapter"
      @close="closeConflict"
      @secondary="useExisting"
      @primary="overwrite"
    />
    <div
      class="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex-none"
    >
      <div class="flex items-center gap-3">
        <h2 class="text-xs font-bold text-slate-500 uppercase tracking-wider">YAML Editor</h2>
        <span
          class="text-xs font-mono"
          :class="status === 'Valid YAML' ? 'text-green-500' : 'text-red-500'"
          >{{ status }}</span
        >
      </div>
      <div class="flex gap-2">
        <button
          class="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors"
          @click="clear"
        >
          Clear
        </button>
      </div>
    </div>

    <div class="flex-1 relative group min-h-0">
      <div class="absolute inset-0 flex flex-col">
        <textarea
          v-model="input"
          class="flex-1 w-full h-full font-mono text-sm bg-white p-4 resize-none outline-none focus:bg-slate-50 transition-colors"
          placeholder="Paste your YAML here..."
          spellcheck="false"
          @input="handleInput"
        />
      </div>
    </div>

    <div class="p-3 border-t border-slate-100 bg-white flex justify-end flex-none">
      <button
        :class="[
          'px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2',
          isEmpty
            ? 'bg-slate-300 text-white cursor-not-allowed'
            : 'bg-primary hover:bg-blue-600 text-white',
        ]"
        :disabled="isEmpty"
        @click="save"
      >
        <i class="fa-regular fa-floppy-disk" />
        <span>{{ saveLabel }}</span>
      </button>
    </div>
  </div>
</template>
