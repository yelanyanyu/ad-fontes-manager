<script setup>
import { useAppStore } from '@/stores/appStore'
import { useWordStore } from '@/stores/wordStore'
import { storeToRefs } from 'pinia'

const appStore = useAppStore()
const wordStore = useWordStore()
const { sidebarOpen } = storeToRefs(appStore)
const { dbConnected } = storeToRefs(wordStore)

const toggle = () => {
  appStore.toggleSidebar()
}
</script>

<template>
    <aside id="sidebar" :class="[sidebarOpen ? 'w-64' : 'w-16', 'bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 flex-none h-full z-20']">
        <!-- Sidebar Toggle -->
        <div class="p-4 flex items-center justify-center h-16 border-b border-slate-800">
            <button @click="toggle" class="text-slate-500 hover:text-white transition-colors p-1">
                <i class="fa-solid fa-bars"></i>
            </button>
        </div>
        
        <!-- Navigation -->
        <nav class="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
            <RouterLink to="/" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors group" :class="{ 'justify-center': !sidebarOpen }">
                <i class="fa-solid fa-book w-5 text-center transition-colors group-hover:text-white"></i>
                <span class="sidebar-text font-medium whitespace-nowrap" :class="{ 'hidden': !sidebarOpen }">Words</span>
            </RouterLink>
            <RouterLink to="/phrase" class="sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors group" :class="{ 'justify-center': !sidebarOpen }">
                <i class="fa-solid fa-quote-left w-5 text-center transition-colors group-hover:text-white"></i>
                <span class="sidebar-text font-medium whitespace-nowrap" :class="{ 'hidden': !sidebarOpen }">Phrases</span>
            </RouterLink>
        </nav>

        <!-- Footer / Settings -->
        <div class="p-4 border-t border-slate-800">
            <RouterLink to="/settings" class="sidebar-item flex items-center gap-3 px-3 py-2.5 w-full rounded-lg hover:bg-slate-800 transition-colors text-left group" :class="{ 'justify-center': !sidebarOpen }">
                <div class="relative flex-none">
                    <i class="fa-solid fa-gear w-5 text-center group-hover:text-white transition-colors"></i>
                    <span id="connStatusDot" class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-slate-900 transition-colors" :class="dbConnected ? 'bg-green-500' : 'bg-red-500'"></span>
                </div>
                <span class="sidebar-text font-medium whitespace-nowrap" :class="{ 'hidden': !sidebarOpen }">Settings</span>
            </RouterLink>
        </div>
    </aside>
</template>
