<script setup>
/**
 * @file Sidebar.vue
 * @description 应用侧边导航栏组件
 *
 * @component Sidebar
 * @description 应用侧边导航栏，包含导航链接和设置入口。支持展开/收起状态切换，
 *              显示 Word 后端连接状态指示器。
 *
 * @example
 * <template>
 *   <Sidebar />
 * </template>
 *
 *
 * import Sidebar from '@/components/Layout/Sidebar.vue';
 *
 *
 * @dependencies
 * - {@link useAppStore} - 应用状态管理，提供侧边栏展开/收起状态
 * - {@link useWordStore} - Word 模块状态管理，提供后端连接状态
 */

import { useAppStore } from '@/stores/appStore';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';

/**
 * 应用状态管理实例
 * @description 使用 useAppStore 获取的应用状态管理实例
 */
const appStore = useAppStore();

/**
 * Word 模块状态管理实例
 * @description 使用 useWordStore 获取的 Word 模块状态管理实例
 */
const wordStore = useWordStore();

/**
 * 侧边栏展开状态
 * @description 从 appStore 获取的响应式侧边栏状态，控制侧边栏的展开(true)或收起(false)
 */
const { sidebarOpen } = storeToRefs(appStore);

/**
 * 后端连接状态
 * @description 从 wordStore 获取的响应式连接状态，用于显示设置图标旁的状态指示器
 * 可能的值：'connected' | 'disconnected' | 'testing'
 */
const { connectionStatus } = storeToRefs(wordStore);

/**
 * 切换侧边栏展开/收起状态
 * @description 调用 appStore 的 toggleSidebar 方法来切换侧边栏的展开/收起状态
 * @returns {void}
 */
const toggle = () => {
  appStore.toggleSidebar();
};
</script>

<template>
  <aside
    id="sidebar"
    :class="[
      sidebarOpen ? 'w-64' : 'w-16',
      'bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 flex-none h-full z-20',
    ]"
  >
    <!-- Sidebar Toggle -->
    <div class="p-4 flex items-center justify-center h-16 border-b border-slate-800">
      <button class="text-slate-500 hover:text-white transition-colors p-1"
@click="toggle">
        <i class="fa-solid fa-bars" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
      <!-- Words 导航链接 -->
      <RouterLink
        to="/"
        class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors group"
        :class="{ 'justify-center': !sidebarOpen }"
      >
        <i class="fa-solid fa-book w-5 text-center transition-colors group-hover:text-white" />
        <span
class="sidebar-text font-medium whitespace-nowrap" :class="{ hidden: !sidebarOpen }"
        >Words</span>
      </RouterLink>
      <!-- Phrases 导航链接 -->
      <RouterLink
        to="/phrase"
        class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors group"
        :class="{ 'justify-center': !sidebarOpen }"
      >
        <i
          class="fa-solid fa-quote-left w-5 text-center transition-colors group-hover:text-white"
        />
        <span
class="sidebar-text font-medium whitespace-nowrap" :class="{ hidden: !sidebarOpen }"
        >Phrases</span>
      </RouterLink>
    </nav>

    <!-- Footer / Settings -->
    <div class="p-4 border-t border-slate-800">
      <RouterLink
        to="/settings"
        class="sidebar-item flex items-center gap-3 px-3 py-2.5 w-full rounded-lg hover:bg-slate-800 transition-colors text-left group"
        :class="{ 'justify-center': !sidebarOpen }"
      >
        <div class="relative flex-none">
          <i class="fa-solid fa-gear w-5 text-center group-hover:text-white transition-colors" />
          <!-- 后端连通状态指示器 -->
          <span
            id="connStatusDot"
            class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-slate-900 transition-colors"
            :class="{
              'bg-green-500': connectionStatus === 'connected',
              'bg-red-500': connectionStatus === 'disconnected',
              'bg-yellow-500': connectionStatus === 'testing',
            }"
          />
        </div>
        <span
class="sidebar-text font-medium whitespace-nowrap" :class="{ hidden: !sidebarOpen }"
        >Settings</span>
      </RouterLink>
    </div>
  </aside>
</template>
