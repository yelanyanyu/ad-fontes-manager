<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useAppStore, SUPPORTED_LANGUAGES } from '@/stores/appStore';
import { useThemeStore } from '@/stores/themeStore';
import BellIcon from '@/components/Announcement/BellIcon.vue';

const appStore = useAppStore();
const themeStore = useThemeStore();
const open = ref(false);
const langMenuRef = ref<HTMLElement | null>(null);

const currentLabel = computed(() =>
  SUPPORTED_LANGUAGES.find(
    (l: { code: string; label: string }) => l.code === appStore.currentLanguage
  )?.label || 'English'
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

<template>
  <header class="topbar">
    <div class="brand">
      <div class="brand-icon">
        <img src="/logo.svg" alt="Logo" class="logo-img" />
      </div>
      <div class="brand-name">Etymos</div>
    </div>

    <div class="top-actions">
      <BellIcon />

      <!-- Theme toggle -->
      <button class="icon-btn" :title="themeStore.isDark ? 'Switch to light' : 'Switch to dark'" @click="themeStore.toggleTheme()">
        <!-- Sun icon (shown in dark mode = switch to light) -->
        <svg v-if="themeStore.isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <!-- Moon icon (shown in light mode = switch to dark) -->
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      <!-- Language switcher -->
      <div ref="langMenuRef" class="lang" @click="open = !open">
        <span class="text-base leading-none">{{ currentFlag }}</span>
        <span>{{ currentLabel }}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

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
          class="lang-dropdown"
        >
          <button
            v-for="lang in SUPPORTED_LANGUAGES"
            :key="lang.code"
            class="lang-option"
            :class="{ active: appStore.currentLanguage === lang.code }"
            @click="select(lang.code)"
          >
            <span class="text-base leading-none">
              {{ lang.code === 'en' ? '🇬🇧' : lang.code === 'de' ? '🇩🇪' : '🌐' }}
            </span>
            <span>{{ lang.label }}</span>
            <svg
              v-if="appStore.currentLanguage === lang.code"
              class="check-mark"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M20.207 6.293a1 1 0 0 1 0 1.414l-8.5 8.5a1 1 0 0 1-1.414 0l-4.5-4.5a1 1 0 1 1 1.414-1.414L11 13.586l7.793-7.793a1 1 0 0 1 1.414 0z"
              />
            </svg>
          </button>
        </div>
      </Transition>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 58px;
  background: rgba(255, 255, 252, 0.76);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 0 28px;
  z-index: 10;
}

[data-theme="dark"] .topbar {
  background: rgba(24, 22, 20, 0.76);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-icon {
  width: 22px;
  height: 22px;
  color: var(--blue);
  display: grid;
  place-items: center;
}

[data-theme="dark"] .brand-icon {
  filter: drop-shadow(0 0 10px rgba(124, 162, 255, 0.16));
}

.logo-img {
  width: 22px;
  height: 22px;
  border-radius: 6px;
}

.brand-name {
  font-family: var(--serif);
  font-size: 23px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  color: #171513;
}

[data-theme="dark"] .brand-name {
  color: #f2eadf;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: #5e5851;
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-sm);
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}

.icon-btn:hover {
  background: #fff;
  border-color: var(--border-strong);
}

[data-theme="dark"] .icon-btn {
  background: rgba(255, 255, 255, 0.05);
  color: #c7beb3;
}

[data-theme="dark"] .icon-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.lang {
  height: 30px;
  min-width: 104px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: #55504a;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

[data-theme="dark"] .lang {
  background: rgba(255, 255, 255, 0.05);
  color: #d8cfc4;
}

.lang-dropdown {
  position: absolute;
  right: 18px;
  top: 52px;
  width: 176px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  padding: 4px;
  z-index: 50;
}

.lang-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  transition: background 0.12s ease;
}

.lang-option:hover {
  background: var(--surface-soft);
}

.lang-option.active {
  color: var(--green);
  font-weight: 600;
}

.check-mark {
  width: 16px;
  height: 16px;
  margin-left: auto;
  color: var(--green);
}
</style>
