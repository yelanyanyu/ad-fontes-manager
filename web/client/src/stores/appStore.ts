import { defineStore } from 'pinia';

export type ToastType = 'info' | 'success' | 'error' | 'warning';
export type LanguageCode = 'en' | 'de';

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
    currentLanguage: 'en',
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
