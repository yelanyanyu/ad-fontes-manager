<!--
/**
 * @file Header.vue
 * @description 应用顶部导航栏组件
 *
 * @component Header
 * @description 应用顶部导航栏，显示 Logo 和标题
 *
 * @usage
 * ```vue
 * <template>
 *   <Header />
 * </template>
 *
 * <script setup lang="ts">
 * import Header from '@/components/Layout/Header.vue'
 * </script>
 * ```
 *
 * @dependencies
 * - 静态资源：/logo.svg - 应用 Logo 图片
 * - 样式框架：Tailwind CSS - 用于布局和样式
 *
 * @features
 * - 显示应用 Logo 和标题 "Etymos"
 * - 固定在页面顶部，带有底部边框分隔
 * - 预留操作按钮区域（右侧）
 *
 * @author Ad Fontes Manager Team
 * @version 1.0.0
 */
-->
<template>
  <header
    class="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 flex-none z-10"
  >
    <!-- Logo & Title -->
    <div class="flex items-center gap-3">
      <img src="/logo.svg"
alt="Logo" class="w-8 h-8 rounded-lg flex-none bg-slate-100"
/>
      <h1 class="font-bold text-slate-800 tracking-tight text-lg">Etymos</h1>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-4 ml-4">
      <!-- Add New Button Placeholder -->
    </div>
  </header>
</template>
