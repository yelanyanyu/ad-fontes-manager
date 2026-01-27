<script setup>
import Sidebar from './components/Layout/Sidebar.vue'
import Header from './components/Layout/Header.vue'
import ToastContainer from './components/ui/ToastContainer.vue'
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-slate-50 text-slate-800">
    <Sidebar />
    
    <div class="flex-1 flex flex-col min-w-0 h-full relative">
      <Header />
      
      <div class="flex-1 relative overflow-hidden">
        <RouterView v-slot="{ Component }">
          <KeepAlive include="HomeView">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </div>

    <ToastContainer />
  </div>
</template>
