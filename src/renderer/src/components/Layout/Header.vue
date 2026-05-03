<template>
  <header
    class="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 flex-none z-10"
  >
    <!-- Logo & Title -->
    <div class="flex items-center gap-3">
      <img src="/logo.svg" alt="Logo" class="w-8 h-8 rounded-lg flex-none bg-slate-100" />
      <h1 class="font-bold text-slate-800 tracking-tight text-lg">Etymos</h1>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-4 ml-4">
      <!-- Language Switcher -->
      <div class="relative" ref="langMenuRef">
        <button
          @click="open = !open"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200
                 transition-colors cursor-pointer"
        >
          <span class="text-base leading-none">{{ currentFlag }}</span>
          <span>{{ currentLabel }}</span>
          <svg
            class="w-3.5 h-3.5 text-slate-400 transition-transform"
            :class="{ 'rotate-180': open }"
            fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <Transition
          enter-active-class="transition ease-out duration-150"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition ease-in duration-100"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="open"
            class="absolute right-0 mt-1.5 w-44 rounded-lg bg-white border border-slate-200
                   shadow-lg py-1 z-50"
          >
            <button
              v-for="lang in SUPPORTED_LANGUAGES"
              :key="lang.code"
              @click="select(lang.code)"
              class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm
                     hover:bg-slate-50 transition-colors text-left"
              :class="
                appStore.currentLanguage === lang.code
                  ? 'text-indigo-600 font-semibold bg-indigo-50/50'
                  : 'text-slate-600'
              "
            >
              <span class="text-base leading-none">
                {{ lang.code === 'en' ? '🇬🇧' : lang.code === 'de' ? '🇩🇪' : '🌐' }}
              </span>
              <span>{{ lang.label }}</span>
              <span v-if="appStore.currentLanguage === lang.code" class="ml-auto text-indigo-500">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path
fill-rule="evenodd" clip-rule="evenodd"
                    d="M20.207 6.293a1 1 0 0 1 0 1.414l-8.5 8.5a1 1 0 0 1-1.414 0l-4.5-4.5a1 1 0 1 1 1.414-1.414L11 13.586l7.793-7.793a1 1 0 0 1 1.414 0z" />
                </svg>
              </span>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAppStore, SUPPORTED_LANGUAGES } from '@/stores/appStore';

const appStore = useAppStore();
const open = ref(false);
const langMenuRef = ref<HTMLElement | null>(null);

const currentLabel = computed(() =>
  SUPPORTED_LANGUAGES.find((l: { code: string; label: string }) => l.code === appStore.currentLanguage)?.label || 'English'
);

const currentFlag = computed(() => {
  if (appStore.currentLanguage === 'en') return '🇬🇧';
  if (appStore.currentLanguage === 'de') return '🇩🇪';
  return '🌐';
});

function select(code: 'en' | 'de') {
  appStore.setLanguage(code);
  open.value = false;
}

function onDocumentClick(e: MouseEvent) {
  if (langMenuRef.value && !langMenuRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onUnmounted(() => document.removeEventListener('click', onDocumentClick));
</script>
