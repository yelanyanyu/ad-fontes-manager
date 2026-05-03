<script setup>
/**
 * @file ToastContainer.vue
 * @component ToastContainer
 * @description 全局消息提示容器组件，用于显示成功、错误、警告、信息提示
 *
 * @usage
 * 该组件通常在 App.vue 中全局挂载，通过 appStore 提供的 addToast 方法触发消息显示
 *
 * @example
 * // 在其他组件中使用
 * import { useAppStore } from '@/stores/appStore';
 * const appStore = useAppStore();
 *
 * // 显示成功消息
 * appStore.addToast({ type: 'success', message: '操作成功！' });
 *
 * // 显示错误消息
 * appStore.addToast({ type: 'error', message: '操作失败！' });
 *
 * // 显示警告消息
 * appStore.addToast({ type: 'warning', message: '请注意！' });
 *
 * // 显示信息消息
 * appStore.addToast({ type: 'info', message: '提示信息' });
 *
 * @dependencies
 * - appStore: 全局应用状态管理，提供 toasts 列表和 removeToast 方法
 */

import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';

/**
 * 应用状态存储实例
 * @type {ReturnType<typeof useAppStore>}
 */
const appStore = useAppStore();

/**
 * 从 appStore 获取的消息列表
 * @type {import('vue').Ref<Array<{id: string, type: 'success'|'error'|'warning'|'info', message: string}>>}
 * @description 包含所有当前显示的消息对象，每个消息包含 id、type 和 message 属性
 */
const { toasts } = storeToRefs(appStore);

/**
 * 移除指定的消息提示
 * @param {string} id - 要移除的消息的唯一标识符
 * @returns {void}
 * @description 调用 appStore 的 removeToast 方法从列表中移除指定 id 的消息
 */
const remove = id => {
  appStore.removeToast(id);
};
</script>

<template>
  <div
    class="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto min-w-[300px] max-w-md bg-white rounded-lg shadow-lg border-l-4 p-4 transform transition-all duration-300 flex items-start gap-3"
        :class="{
          'border-blue-500': toast.type === 'info',
          'border-green-500': toast.type === 'success',
          'border-yellow-500': toast.type === 'warning',
          'border-red-500': toast.type === 'error',
        }"
      >
        <div class="flex-shrink-0 pt-0.5">
          <i v-if="toast.type === 'success'" class="fa-solid fa-check-circle text-green-500" />
          <i
            v-else-if="toast.type === 'error'"
            class="fa-solid fa-circle-exclamation text-red-500"
          />
          <i
            v-else-if="toast.type === 'warning'"
            class="fa-solid fa-triangle-exclamation text-yellow-500"
          />
          <i v-else class="fa-solid fa-circle-info text-blue-500" />
        </div>
        <div class="flex-1 text-sm text-slate-700 font-medium break-words">
          {{ toast.message }}
        </div>
        <button
          class="text-slate-400 hover:text-slate-600 transition-colors"
          @click="remove(toast.id)"
        >
          <i class="fa-solid fa-xmark" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/**
 * 消息提示过渡动画样式
 * @description 使用 Vue TransitionGroup 实现消息进入和离开的动画效果
 *
 * @animation toast-enter
 * - 进入动画：从右侧滑入，同时淡入
 * - 起始状态：opacity: 0, translateX(30px)
 * - 结束状态：opacity: 1, translateX(0)
 * - 持续时间：300ms
 *
 * @animation toast-leave
 * - 离开动画：向右侧滑出，同时淡出
 * - 起始状态：opacity: 1, translateX(0)
 * - 结束状态：opacity: 0, translateX(30px)
 * - 持续时间：300ms
 */

/* 进入和离开动画的激活状态 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

/* 进入动画的起始状态：从右侧偏移并透明 */
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

/* 离开动画的结束状态：向右侧偏移并透明 */
.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
