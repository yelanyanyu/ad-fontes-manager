import { defineStore } from 'pinia';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface AppState {
  sidebarOpen: boolean;
  toasts: ToastItem[];
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    sidebarOpen: true,
    toasts: [],
  }),

  actions: {
    toggleSidebar(): void {
      this.sidebarOpen = !this.sidebarOpen;
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
