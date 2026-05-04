<script setup>
/**
 * @file Sidebar.vue
 * @description 应用侧边导航栏组件
 *
 * @component Sidebar
 * @description 应用侧边导航栏，包含导航链接和设置入口。支持展开/收起状态切换。
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
 *  */

import { useAppStore } from '@/stores/appStore';
import { storeToRefs } from 'pinia';

const appStore = useAppStore();

/**
 * 侧边栏展开状态
 * @description 从 appStore 获取的响应式侧边栏状态，控制侧边栏的展开(true)或收起(false)
 */
const { sidebarOpen } = storeToRefs(appStore);


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
      'bg-emerald-950 text-emerald-200 flex flex-col transition-all duration-300 flex-none h-full z-20',
    ]"
  >
    <!-- Sidebar Toggle -->
    <div class="p-4 flex items-center justify-center h-16 border-b border-emerald-800/50">
      <button class="text-emerald-400 hover:text-white transition-colors p-1" @click="toggle">
        <i class="fa-solid fa-bars" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
      <!-- Words 导航链接 -->
      <RouterLink
        to="/"
        class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-800/40 transition-colors group"
        :class="{ 'justify-center': !sidebarOpen }"
      >
        <i class="fa-solid fa-book w-5 text-center transition-colors group-hover:text-white" />
        <span class="sidebar-text font-medium whitespace-nowrap" :class="{ hidden: !sidebarOpen }"
          >Words</span
        >
      </RouterLink>
      <!-- Phrases 导航链接 -->
      <RouterLink
        to="/phrase"
        class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-800/40 transition-colors group"
        :class="{ 'justify-center': !sidebarOpen }"
      >
        <i
          class="fa-solid fa-quote-left w-5 text-center transition-colors group-hover:text-white"
        />
        <span class="sidebar-text font-medium whitespace-nowrap" :class="{ hidden: !sidebarOpen }"
          >Phrases</span
        >
      </RouterLink>
      <RouterLink
        to="/editor"
        data-tour="generate-entry"
        class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-800/40 transition-colors group"
        :class="{ 'justify-center': !sidebarOpen }"
      >
        <i
          class="fa-solid fa-wand-magic-sparkles w-5 text-center transition-colors group-hover:text-white"
        />
        <span class="sidebar-text font-medium whitespace-nowrap" :class="{ hidden: !sidebarOpen }"
          >Generate</span
        >
      </RouterLink>
    </nav>

    <!-- Footer / Settings -->
    <div class="p-4 border-t border-emerald-800/50">
      <RouterLink
        to="/settings"
        class="sidebar-item flex items-center gap-3 px-3 py-2.5 w-full rounded-xl hover:bg-emerald-800/40 transition-colors text-left group"
        :class="{ 'justify-center': !sidebarOpen }"
      >
        <div class="relative flex-none">
          <i class="fa-solid fa-gear w-5 text-center group-hover:text-white transition-colors" />
        </div>
        <span class="sidebar-text font-medium whitespace-nowrap" :class="{ hidden: !sidebarOpen }"
          >Settings</span
        >
      </RouterLink>
    </div>
  </aside>
</template>
