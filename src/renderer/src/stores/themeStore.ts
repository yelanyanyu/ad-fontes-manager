import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'etymos-theme';
const THEME_ATTR = 'data-theme';

function loadPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* noop */
  }
  return 'system';
}

function savePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* noop */
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute(THEME_ATTR, resolved);
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(loadPreference());
  const resolved = ref<ResolvedTheme>(
    preference.value === 'system' ? systemTheme() : preference.value
  );

  // Apply on init
  applyTheme(resolved.value);

  // Listen for system changes when in 'system' mode
  const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemQuery.addEventListener('change', e => {
    if (preference.value === 'system') {
      resolved.value = e.matches ? 'dark' : 'light';
      applyTheme(resolved.value);
    }
  });

  function setTheme(pref: ThemePreference): void {
    preference.value = pref;
    savePreference(pref);
    resolved.value = pref === 'system' ? systemTheme() : pref;
    applyTheme(resolved.value);
  }

  /** Quick toggle for topbar: cycles light ↔ dark (overrides system) */
  function toggleTheme(): void {
    setTheme(resolved.value === 'dark' ? 'light' : 'dark');
  }

  const isDark = computed(() => resolved.value === 'dark');

  return {
    preference,
    resolved,
    isDark,
    setTheme,
    toggleTheme,
  };
});
