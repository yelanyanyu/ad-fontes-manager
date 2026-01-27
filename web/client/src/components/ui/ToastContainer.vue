<script setup>
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const appStore = useAppStore()
const { toasts } = storeToRefs(appStore)

const remove = (id) => {
  appStore.removeToast(id)
}
</script>

<template>
  <div class="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts" :key="toast.id" 
           class="pointer-events-auto min-w-[300px] max-w-md bg-white rounded-lg shadow-lg border-l-4 p-4 transform transition-all duration-300 flex items-start gap-3"
           :class="{
             'border-blue-500': toast.type === 'info',
             'border-green-500': toast.type === 'success',
             'border-yellow-500': toast.type === 'warning',
             'border-red-500': toast.type === 'error'
           }">
        <div class="flex-shrink-0 pt-0.5">
          <i v-if="toast.type === 'success'" class="fa-solid fa-check-circle text-green-500"></i>
          <i v-else-if="toast.type === 'error'" class="fa-solid fa-circle-exclamation text-red-500"></i>
          <i v-else-if="toast.type === 'warning'" class="fa-solid fa-triangle-exclamation text-yellow-500"></i>
          <i v-else class="fa-solid fa-circle-info text-blue-500"></i>
        </div>
        <div class="flex-1 text-sm text-slate-700 font-medium break-words">{{ toast.message }}</div>
        <button @click="remove(toast.id)" class="text-slate-400 hover:text-slate-600 transition-colors">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
