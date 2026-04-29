import { defineStore } from 'pinia';

export type ToastType = 'info' | 'success' | 'error' | 'warning';
export type LanguageCode = 'en' | 'de';

export const SUPPORTED_LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
];

const LANG_STORAGE_KEY = 'etymos-language';

function loadLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'en' || stored === 'de') return stored;
  } catch { /* noop */ }
  return 'en';
}

function saveLanguage(lang: LanguageCode): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch { /* noop */ }
}

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface AppState {
  sidebarOpen: boolean;
  toasts: ToastItem[];
  currentLanguage: LanguageCode;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    sidebarOpen: true,
    toasts: [],
    currentLanguage: loadLanguage(),
  }),

  getters: {
    language: (state): LanguageCode => state.currentLanguage,
  },

  actions: {
    toggleSidebar(): void {
      this.sidebarOpen = !this.sidebarOpen;
    },

    setLanguage(lang: LanguageCode): void {
      this.currentLanguage = lang;
      saveLanguage(lang);
    },

    addToast(message: string, type: ToastType = 'info', duration = 3000): void {
      const id = Date.now();
      this.toasts.push({ id, message, type });

      if (duration > 0) {
        setTimeout(() => {
          this.removeToast(id);
        }, duration);
      }
    },

    removeToast(id: number): void {
      const index = this.toasts.findIndex(t => t.id === id);
      if (index !== -1) {
        this.toasts.splice(index, 1);
      }
    },
  },
});
