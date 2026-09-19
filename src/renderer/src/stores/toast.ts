import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([])

  function showToast(message: string, type: ToastType = 'info', duration = 3500): string {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const toast: ToastItem = {
      id,
      message,
      type,
      duration
    }

    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }

  function removeToast(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function clearToasts(): void {
    toasts.value = []
  }

  return {
    toasts,
    showToast,
    removeToast,
    clearToasts
  }
})
